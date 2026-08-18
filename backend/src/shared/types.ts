/**
 * Domain-wide constants and shared DTO/type definitions.
 *
 * Naming and shapes mirror `docs/CONTRACTS.md` exactly — that document is the
 * source of truth shared with the frontend team.
 */

/** Maximum size (bytes) accepted for an uploaded audio file (20 MB). */
export const MAX_AUDIO_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** S3 presigned POST enforces the content-type starts with this prefix. */
export const AUDIO_CONTENT_TYPE_PREFIX = 'audio/';

/** Default number of items returned by a single `listTranscriptions` page. */
export const DEFAULT_PAGE_SIZE = 10;

/** Hard ceiling on page size, regardless of what the caller requests. */
export const MAX_PAGE_SIZE = 10;

/**
 * A `PROCESSING` item whose `updatedAt` is older than this many minutes is
 * considered "stuck" (likely missed webhook) by `checkStuckTranscriptions`.
 */
export const STUCK_PROCESSING_THRESHOLD_MINUTES = 10;

/** Expiry, in seconds, for presigned transcript download URLs (15 minutes). */
export const DOWNLOAD_URL_EXPIRY_SECONDS = 15 * 60;

/** TTL, in seconds, requested for short-lived Speechmatics real-time API keys. */
export const REALTIME_TOKEN_TTL_SECONDS = 60;

/**
 * Upper bound on the transcript text accepted by `saveRealtimeTranscript`.
 * A real dictation session's text is small; this cap (roughly 500k
 * characters) exists purely to reject abusive/malformed payloads before we
 * write them to S3 and DynamoDB, not to accommodate any real use case.
 */
export const MAX_REALTIME_TRANSCRIPT_LENGTH = 500_000;

/** Standard JSON response headers shared by every handler response. */
export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/**
 * Language codes offered by the UI. Speechmatics supports ~55 languages; this
 * is a curated subset kept small enough for a single dropdown. Add codes from
 * docs.speechmatics.com/introduction/supported-languages as needed.
 *
 * `auto` runs Speechmatics' Language Identification and is **batch only** —
 * the real-time WebSocket API requires an explicit language, hence two lists.
 */
export const REALTIME_LANGUAGES = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'nl',
  'ca',
  'pl',
  'ru',
  'ja',
  'cmn',
] as const;

export type RealtimeLanguage = (typeof REALTIME_LANGUAGES)[number];

export const BATCH_LANGUAGES = ['auto', ...REALTIME_LANGUAGES] as const;

export type BatchLanguage = (typeof BATCH_LANGUAGES)[number];

/** Uploaded files default to automatic language identification. */
export const DEFAULT_BATCH_LANGUAGE: BatchLanguage = 'auto';

/** Real-time sessions can't auto-detect, so they need a concrete default. */
export const DEFAULT_REALTIME_LANGUAGE: RealtimeLanguage = 'en';

export type TranscriptionType = 'FILE' | 'REALTIME';

export type TranscriptionStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/**
 * Framework-agnostic representation of a transcription record. This is the
 * shape handlers and domain code operate on; `infra/dynamo.ts` is
 * responsible for translating to/from the DynamoDB item shape (which adds
 * `PK`/`SK`/`GSI1PK`).
 */
export interface Transcription {
  transcriptionId: string;
  userId: string;
  type: TranscriptionType;
  status: TranscriptionStatus;
  sourceFileName?: string;
  audioS3Key?: string;
  transcriptS3Key?: string;
  language?: string;
  durationSeconds?: number;
  speechmaticsJobId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields that may be patched on a transcription as its lifecycle progresses. */
export interface TranscriptionStatusPatch {
  status: TranscriptionStatus;
  speechmaticsJobId?: string;
  transcriptS3Key?: string;
  errorMessage?: string;
  language?: string;
  durationSeconds?: number;
}

/** Verified caller identity extracted from the Cognito JWT authorizer claims. */
export interface CallerClaims {
  sub: string;
  email: string;
}

// ---- Request / response DTOs (see docs/CONTRACTS.md "REST API" section) ----

export interface UploadUrlRequestBody {
  filename: string;
  contentType: string;
  /** Omitted means `DEFAULT_BATCH_LANGUAGE` (auto-detect). */
  language?: BatchLanguage;
}

export interface UploadUrlResponseBody {
  transcriptionId: string;
  uploadUrl: string;
  fields: Record<string, string>;
}

export interface RealtimeTranscriptRequestBody {
  transcriptText: string;
  durationSeconds?: number;
  language?: string;
}

export interface RealtimeTranscriptResponseBody {
  transcriptionId: string;
  status: TranscriptionStatus;
}

export interface ListTranscriptionsResponseBody {
  items: Transcription[];
  nextCursor: string | null;
}

export interface DownloadUrlResponseBody {
  downloadUrl: string;
}

export interface RealtimeTokenResponseBody {
  token: string;
  url: string;
}

export interface MeResponseBody {
  sub: string;
  email: string;
}

export interface WebhookAckResponseBody {
  received: boolean;
}
