/**
 * POST /transcriptions/webhook (NOT Cognito-authenticated)
 *
 * Speechmatics calls this when a batch job finishes (successfully or not).
 * Authenticated instead via a shared secret in the `x-webhook-secret` header,
 * checked against the value stored in SSM. The job's owning transcription is
 * identified via `?transcriptionId=&userId=` query params we attached to the
 * webhook URL when the job was submitted (see `processUploadedAudio`).
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getTranscriptionById, updateTranscriptionStatus } from '../infra/dynamo';
import { persistTranscriptOutputs } from '../infra/s3';
import { extractDetectedLanguage, getJobTranscript } from '../infra/speechmatics';
import { getSecureParam } from '../infra/ssm';
import { requireEnv } from '../shared/env';
import { errorToResponse, UnauthorizedError } from '../shared/errors';
import { getHeader, ok, parseBody, parseQuery } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { speechmaticsWebhookPayloadSchema, webhookCorrelationQuerySchema } from '../shared/schemas';
import { Transcription, WebhookAckResponseBody } from '../shared/types';

const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';
const SUCCESS_STATUSES = new Set(['done', 'success']);
const FAILURE_STATUSES = new Set(['rejected', 'failed', 'expired']);

/**
 * Constant-time string comparison. A plain `===` (or `!==`) comparison on
 * secret values is a timing side-channel: JS string equality short-circuits
 * on the first differing character, so an attacker who can measure response
 * latency could recover the secret byte-by-byte. We hash both sides to a
 * fixed-length digest first (so `timingSafeEqual` never throws on a length
 * mismatch, which would itself leak the secret's length) and then compare
 * the digests in constant time.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash('sha256').update(provided, 'utf-8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf-8').digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

async function assertWebhookSecret(event: APIGatewayProxyEventV2): Promise<void> {
  const provided = getHeader(event, WEBHOOK_SECRET_HEADER);
  const expected = await getSecureParam(requireEnv('SPEECHMATICS_WEBHOOK_SECRET_PARAM'));
  if (!provided || !secretsMatch(provided, expected)) {
    throw new UnauthorizedError('Invalid webhook secret');
  }
}

async function completeTranscription(transcription: Transcription, jobId: string): Promise<void> {
  const { userId, transcriptionId } = transcription;
  const [text, json] = await Promise.all([getJobTranscript(jobId, 'txt'), getJobTranscript(jobId, 'json-v2')]);
  const { textKey } = await persistTranscriptOutputs(userId, transcriptionId, text, json);

  // A record submitted with `auto` still holds the literal 'auto' the user
  // picked — the language Language Identification actually settled on exists
  // only in the json-v2 metadata. Write it back here, or the history row would
  // read "Detect automatically" for the rest of the record's life.
  const detected = extractDetectedLanguage(json);

  await updateTranscriptionStatus(transcriptionId, {
    status: 'COMPLETED',
    transcriptS3Key: textKey,
    // `undefined` leaves the stored value untouched (see `buildUpdateExpression`).
    language: detected === transcription.language ? undefined : detected,
  });
}

/**
 * Fetches the correlated transcription and cross-checks it against the
 * webhook's query-string correlation params and job id before we act on it.
 * Returns `null` (rather than throwing) for anything that doesn't line up,
 * so the handler can ack with 200 and drop the event instead of surfacing a
 * 404/500 that would make Speechmatics retry a callback that will never
 * succeed (e.g. a stale delivery for a transcription that was superseded,
 * or a mismatched/forged correlation id).
 */
async function resolveTranscription(transcriptionId: string, userId: string, jobId: string): Promise<Transcription | null> {
  const transcription = await getTranscriptionById(transcriptionId);
  if (!transcription) {
    logger.warn('Webhook received for an unknown transcriptionId', { transcriptionId });
    return null;
  }
  if (transcription.userId !== userId) {
    logger.warn('Webhook correlation userId did not match the transcription owner', { transcriptionId });
    return null;
  }
  if (transcription.speechmaticsJobId && transcription.speechmaticsJobId !== jobId) {
    logger.warn('Webhook job id did not match the transcription\'s recorded job id; ignoring stale/duplicate delivery', {
      transcriptionId,
    });
    return null;
  }
  return transcription;
}

async function applyWebhookOutcome(transcription: Transcription, status: string, jobId: string): Promise<void> {
  if (SUCCESS_STATUSES.has(status)) {
    await completeTranscription(transcription, jobId);
  } else if (FAILURE_STATUSES.has(status)) {
    await updateTranscriptionStatus(transcription.transcriptionId, { status: 'FAILED', errorMessage: `Speechmatics job ${status}` });
  } else {
    logger.warn('Received webhook with unrecognized status', { transcriptionId: transcription.transcriptionId, status });
  }
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    await assertWebhookSecret(event);
    const { transcriptionId, userId } = parseQuery(event, webhookCorrelationQuerySchema);
    const payload = parseBody(event, speechmaticsWebhookPayloadSchema);

    const transcription = await resolveTranscription(transcriptionId, userId, payload.id);
    if (transcription) {
      await applyWebhookOutcome(transcription, payload.status, payload.id);
    }

    const response: WebhookAckResponseBody = { received: true };
    return ok(response);
  } catch (error) {
    logger.error('speechmaticsWebhook failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
