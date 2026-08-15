/**
 * POST /transcriptions/upload-url (Cognito-authenticated)
 *
 * Creates a transcription record in `PENDING_UPLOAD` state and returns an S3
 * presigned POST the browser can use to upload the audio file directly,
 * bypassing API Gateway/Lambda payload limits entirely.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { buildAudioKey, createFileTranscription, generateTranscriptionId } from '../domain/transcription';
import { putTranscription } from '../infra/dynamo';
import { createAudioUploadPost } from '../infra/s3';
import { errorToResponse } from '../shared/errors';
import { getCallerClaims, ok, parseBody } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { uploadUrlRequestSchema } from '../shared/schemas';
import { UploadUrlResponseBody } from '../shared/types';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const caller = getCallerClaims(event);
    const body = parseBody(event, uploadUrlRequestSchema);

    const transcriptionId = generateTranscriptionId();
    const audioS3Key = buildAudioKey(caller.sub, transcriptionId, body.filename);
    const now = new Date().toISOString();

    const transcription = createFileTranscription({
      transcriptionId,
      userId: caller.sub,
      sourceFileName: body.filename,
      audioS3Key,
      now,
    });
    await putTranscription(transcription);

    const post = await createAudioUploadPost({ key: audioS3Key, contentType: body.contentType });

    const response: UploadUrlResponseBody = {
      transcriptionId,
      uploadUrl: post.url,
      fields: post.fields,
    };
    return ok(response);
  } catch (error) {
    logger.error('getUploadUrl failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
