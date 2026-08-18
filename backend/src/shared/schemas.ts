import { z } from 'zod';
import { BATCH_LANGUAGES, MAX_PAGE_SIZE, MAX_REALTIME_TRANSCRIPT_LENGTH, REALTIME_LANGUAGES } from './types';

const FILENAME_MAX_LENGTH = 255;
const CONTENT_TYPE_MAX_LENGTH = 100;

/**
 * Strict `audio/<subtype>` MIME type, e.g. `audio/mpeg`, `audio/wav`,
 * `audio/x-m4a`. Deliberately narrower than a mere "starts with audio/"
 * prefix check: the old `.startsWith()` check would have accepted a
 * contentType containing arbitrary trailing bytes (including CR/LF), which
 * then flows into the S3 presigned POST `Content-Type` field and the
 * Speechmatics multipart request — an unvalidated value there is a header/
 * request-smuggling-adjacent injection surface, however narrow.
 */
const AUDIO_CONTENT_TYPE_PATTERN = /^audio\/[a-zA-Z0-9][a-zA-Z0-9.+-]*$/;

export const uploadUrlRequestSchema = z.object({
  filename: z.string().trim().min(1, 'filename is required').max(FILENAME_MAX_LENGTH),
  contentType: z
    .string()
    .trim()
    .min(1, 'contentType is required')
    .max(CONTENT_TYPE_MAX_LENGTH)
    .regex(AUDIO_CONTENT_TYPE_PATTERN, 'contentType must be a valid "audio/<subtype>" MIME type'),
  // Closed enum rather than a free-form string: this value is forwarded
  // verbatim into the Speechmatics job config, so only codes we know the
  // service accepts should ever get that far.
  language: z.enum(BATCH_LANGUAGES).optional(),
});
export type UploadUrlRequestInput = z.infer<typeof uploadUrlRequestSchema>;

export const realtimeTranscriptRequestSchema = z.object({
  transcriptText: z.string().trim().min(1, 'transcriptText is required').max(MAX_REALTIME_TRANSCRIPT_LENGTH, 'transcriptText is too long'),
  durationSeconds: z.number().nonnegative().optional(),
  language: z.enum(REALTIME_LANGUAGES).optional(),
});
export type RealtimeTranscriptRequestInput = z.infer<typeof realtimeTranscriptRequestSchema>;

export const listTranscriptionsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).optional(),
});
export type ListTranscriptionsQueryInput = z.infer<typeof listTranscriptionsQuerySchema>;

/**
 * Shape of the Speechmatics batch job notification (webhook) payload.
 * Speechmatics posts `{ id, status }` (plus additional fields we don't need)
 * to `notification_config[].url` when a job finishes or fails.
 */
export const speechmaticsWebhookPayloadSchema = z.object({
  id: z.string().min(1, 'id is required'),
  status: z.string().min(1, 'status is required'),
});
export type SpeechmaticsWebhookPayload = z.infer<typeof speechmaticsWebhookPayloadSchema>;

/** Correlation query params we attach to the webhook URL when submitting the job. */
export const webhookCorrelationQuerySchema = z.object({
  transcriptionId: z.string().min(1, 'transcriptionId is required'),
  userId: z.string().min(1, 'userId is required'),
});
export type WebhookCorrelationQuery = z.infer<typeof webhookCorrelationQuerySchema>;
