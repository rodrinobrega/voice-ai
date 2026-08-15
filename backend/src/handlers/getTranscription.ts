/**
 * GET /transcriptions/{id} (Cognito-authenticated)
 *
 * Fetches a single transcription (ownership-checked) so the frontend can
 * poll for status while a `FILE` transcription moves through
 * `PENDING_UPLOAD` -> `PROCESSING` -> `COMPLETED`/`FAILED`.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { assertOwnership } from '../domain/ownership';
import { getTranscriptionById } from '../infra/dynamo';
import { errorToResponse, NotFoundError } from '../shared/errors';
import { getCallerClaims, ok, requirePathParam } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const caller = getCallerClaims(event);
    const transcriptionId = requirePathParam(event, 'id');

    const transcription = await getTranscriptionById(transcriptionId);
    if (!transcription) {
      throw new NotFoundError(`Transcription ${transcriptionId} not found`);
    }
    assertOwnership(transcription.userId, caller.sub);

    return ok(transcription);
  } catch (error) {
    logger.error('getTranscription failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
