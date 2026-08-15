/**
 * GET /transcriptions/{id}/download (Cognito-authenticated)
 *
 * Verifies the caller owns the transcription, then returns a short-lived
 * presigned GET URL for its transcript object in S3.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { assertOwnership } from '../domain/ownership';
import { getTranscriptionById } from '../infra/dynamo';
import { getTranscriptDownloadUrl } from '../infra/s3';
import { errorToResponse, NotFoundError, ValidationError } from '../shared/errors';
import { getCallerClaims, ok, requirePathParam } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { DownloadUrlResponseBody } from '../shared/types';

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

    if (!transcription.transcriptS3Key) {
      throw new ValidationError('Transcript is not available yet');
    }

    const downloadUrl = await getTranscriptDownloadUrl(transcription.transcriptS3Key);
    const response: DownloadUrlResponseBody = { downloadUrl };
    return ok(response);
  } catch (error) {
    logger.error('getDownloadUrl failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
