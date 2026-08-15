/**
 * POST /transcriptions/realtime (Cognito-authenticated)
 *
 * Called once the browser's direct WebSocket session with Speechmatics ends
 * and the frontend has assembled the final transcript text. Persists it to
 * the transcripts bucket and creates a `REALTIME`/`COMPLETED` history entry.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { buildTranscriptTextKey, createRealtimeTranscription, generateTranscriptionId } from '../domain/transcription';
import { putTranscription } from '../infra/dynamo';
import { putTranscriptText } from '../infra/s3';
import { errorToResponse } from '../shared/errors';
import { getCallerClaims, ok, parseBody } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { realtimeTranscriptRequestSchema } from '../shared/schemas';
import { RealtimeTranscriptResponseBody } from '../shared/types';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const caller = getCallerClaims(event);
    const body = parseBody(event, realtimeTranscriptRequestSchema);

    const transcriptionId = generateTranscriptionId();
    const transcriptS3Key = buildTranscriptTextKey(caller.sub, transcriptionId);
    await putTranscriptText(transcriptS3Key, body.transcriptText, 'text/plain; charset=utf-8');

    const now = new Date().toISOString();
    const transcription = createRealtimeTranscription({
      transcriptionId,
      userId: caller.sub,
      transcriptS3Key,
      now,
      durationSeconds: body.durationSeconds,
      language: body.language,
    });
    await putTranscription(transcription);

    const response: RealtimeTranscriptResponseBody = { transcriptionId, status: transcription.status };
    return ok(response);
  } catch (error) {
    logger.error('saveRealtimeTranscript failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
