/**
 * S3 `ObjectCreated` trigger on the audio bucket.
 *
 * Parses `userId`/`transcriptionId` out of the object key, submits a
 * Speechmatics batch job for the uploaded audio, and moves the transcription
 * to `PROCESSING`. The webhook callback URL is annotated with
 * `?transcriptionId=&userId=` query params so `speechmaticsWebhook` can
 * correlate the callback back to our record without an extra GSI lookup by
 * job id.
 */
import type { S3EventRecord, S3Handler } from 'aws-lambda';
import { extractIdsFromAudioKey } from '../domain/transcription';
import { updateTranscriptionStatus } from '../infra/dynamo';
import { getObjectStream } from '../infra/s3';
import { submitBatchJob } from '../infra/speechmatics';
import { getSecureParam } from '../infra/ssm';
import { requireEnv } from '../shared/env';
import { errorMessage, logger } from '../shared/logger';

const DEFAULT_AUDIO_CONTENT_TYPE = 'audio/mpeg';

function decodeObjectKey(rawKey: string): string {
  return decodeURIComponent(rawKey.replace(/\+/g, ' '));
}

function buildWebhookUrl(userId: string, transcriptionId: string): string {
  const base = requireEnv('API_BASE_URL').replace(/\/$/, '');
  const params = new URLSearchParams({ userId, transcriptionId });
  return `${base}/transcriptions/webhook?${params.toString()}`;
}

async function submitJobForKey(bucket: string, key: string, userId: string, transcriptionId: string): Promise<string> {
  const { body, contentType } = await getObjectStream(bucket, key);
  const webhookSecret = await getSecureParam(requireEnv('SPEECHMATICS_WEBHOOK_SECRET_PARAM'));
  const { jobId } = await submitBatchJob({
    audio: body,
    filename: key.split('/').pop() ?? 'audio',
    contentType: contentType ?? DEFAULT_AUDIO_CONTENT_TYPE,
    webhookUrl: buildWebhookUrl(userId, transcriptionId),
    webhookSecret,
  });
  return jobId;
}

async function markFailed(transcriptionId: string, reason: string): Promise<void> {
  try {
    await updateTranscriptionStatus(transcriptionId, { status: 'FAILED', errorMessage: reason });
  } catch (updateError) {
    logger.error('Failed to mark transcription as FAILED after submission error', {
      transcriptionId,
      error: errorMessage(updateError),
    });
  }
}

async function processRecord(record: S3EventRecord): Promise<void> {
  const bucket = record.s3.bucket.name;
  const key = decodeObjectKey(record.s3.object.key);
  const ids = extractIdsFromAudioKey(key);

  if (!ids) {
    logger.warn('Could not parse userId/transcriptionId from S3 key', { key });
    return;
  }

  try {
    const jobId = await submitJobForKey(bucket, key, ids.userId, ids.transcriptionId);
    await updateTranscriptionStatus(ids.transcriptionId, { status: 'PROCESSING', speechmaticsJobId: jobId });
    logger.info('Submitted Speechmatics batch job', { transcriptionId: ids.transcriptionId, jobId });
  } catch (error) {
    logger.error('processUploadedAudio failed to submit job', {
      transcriptionId: ids.transcriptionId,
      error: errorMessage(error),
    });
    await markFailed(ids.transcriptionId, 'Failed to submit transcription job to Speechmatics');
  }
}

export const handler: S3Handler = async (event): Promise<void> => {
  await Promise.all(event.Records.map((record) => processRecord(record)));
};
