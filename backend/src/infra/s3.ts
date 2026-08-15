/**
 * S3 adapter — the only file that imports `@aws-sdk/client-s3`,
 * `@aws-sdk/s3-presigned-post`, and `@aws-sdk/s3-request-presigner`.
 */
import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { buildTranscriptJsonKey, buildTranscriptTextKey } from '../domain/transcription';
import { requireEnv } from '../shared/env';
import { AUDIO_CONTENT_TYPE_PREFIX, DOWNLOAD_URL_EXPIRY_SECONDS, MAX_AUDIO_FILE_SIZE_BYTES } from '../shared/types';

const MIN_AUDIO_FILE_SIZE_BYTES = 0;
const UPLOAD_POST_EXPIRY_SECONDS = 5 * 60;

const s3Client = new S3Client({});

function audioBucket(): string {
  return requireEnv('AUDIO_BUCKET');
}

function transcriptsBucket(): string {
  return requireEnv('TRANSCRIPTS_BUCKET');
}

export interface CreateAudioUploadPostResult {
  url: string;
  fields: Record<string, string>;
}

/**
 * Builds a presigned POST for the browser to upload directly to the audio
 * bucket, enforcing the 20 MB size cap and `audio/*` content type via S3
 * POST policy conditions (not just client-side validation).
 */
export async function createAudioUploadPost(params: { key: string; contentType: string }): Promise<CreateAudioUploadPostResult> {
  const result = await createPresignedPost(s3Client, {
    Bucket: audioBucket(),
    Key: params.key,
    Conditions: [
      ['content-length-range', MIN_AUDIO_FILE_SIZE_BYTES, MAX_AUDIO_FILE_SIZE_BYTES],
      ['starts-with', '$Content-Type', AUDIO_CONTENT_TYPE_PREFIX],
    ],
    Fields: { 'Content-Type': params.contentType },
    Expires: UPLOAD_POST_EXPIRY_SECONDS,
  });
  return { url: result.url, fields: result.fields };
}

/** Presigned GET for downloading a completed transcript (15 minute expiry). */
export async function getTranscriptDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: transcriptsBucket(), Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS });
}

/** Writes a transcript's text body (plain text or JSON) to the transcripts bucket. */
export async function putTranscriptText(key: string, body: string, contentType: string): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: transcriptsBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Writes both the `.txt` and `.json` transcript outputs and returns their keys. */
export async function persistTranscriptOutputs(
  userId: string,
  transcriptionId: string,
  textBody: string,
  jsonBody: string,
): Promise<{ textKey: string; jsonKey: string }> {
  const textKey = buildTranscriptTextKey(userId, transcriptionId);
  const jsonKey = buildTranscriptJsonKey(userId, transcriptionId);
  await Promise.all([
    putTranscriptText(textKey, textBody, 'text/plain; charset=utf-8'),
    putTranscriptText(jsonKey, jsonBody, 'application/json'),
  ]);
  return { textKey, jsonKey };
}

export interface ObjectStream {
  body: Readable;
  contentType?: string;
}

function isNodeReadable(value: unknown): value is Readable {
  return typeof value === 'object' && value !== null && typeof (value as { pipe?: unknown }).pipe === 'function';
}

/**
 * Fetches an object from S3 as a Node.js `Readable` stream.
 *
 * NOTE (production TODO): `processUploadedAudio` currently buffers this
 * stream in full before forwarding it to Speechmatics (see
 * `infra/speechmatics.ts`) because Node's built-in `FormData`/`Blob` can't
 * multipart-encode a stream without consuming it. A production version
 * should use a true streaming multipart encoder (e.g. `form-data` with
 * `Duplex`/chunked transfer, or Speechmatics' resumable upload flow) so a
 * 20 MB file never sits fully in Lambda memory at once.
 */
export async function getObjectStream(bucket: string, key: string): Promise<ObjectStream> {
  const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!isNodeReadable(result.Body)) {
    throw new Error(`Unexpected S3 GetObject body type for s3://${bucket}/${key}`);
  }
  return { body: result.Body, contentType: result.ContentType };
}
