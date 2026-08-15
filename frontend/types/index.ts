/**
 * Shared TypeScript types mirroring the backend's DTOs and API response
 * shapes documented in `docs/CONTRACTS.md`. Keep this file the single
 * source of truth for cross-cutting types used by stores/composables/UI.
 */

/** How a transcription was produced. */
export type TranscriptionType = 'FILE' | 'REALTIME'

/** Lifecycle status of a transcription record. */
export type TranscriptionStatus =
  | 'PENDING_UPLOAD'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'

/** Mirrors the DynamoDB item shape (minus PK/SK) returned by the API. */
export interface Transcription {
  transcriptionId: string
  userId: string
  type: TranscriptionType
  status: TranscriptionStatus
  sourceFileName?: string
  audioS3Key?: string
  transcriptS3Key?: string
  language?: string
  durationSeconds?: number
  speechmaticsJobId?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

/** Response of `GET /me`. */
export interface MeResponse {
  userId: string
  email: string
}

/** Response of `POST /transcriptions/upload-url`. */
export interface UploadUrlResponse {
  transcriptionId: string
  uploadUrl: string
  fields: Record<string, string>
}

/** Response of `POST /transcriptions/realtime-token`. */
export interface RealtimeTokenResponse {
  token: string
  url: string
}

/** Request body of `POST /transcriptions/realtime`. */
export interface SaveRealtimeTranscriptRequest {
  transcriptText: string
  durationSeconds?: number
  language?: string
}

/** Response of `GET /transcriptions?cursor=&limit=10`. */
export interface ListTranscriptionsResponse {
  items: Transcription[]
  nextCursor: string | null
}

/** Response of `GET /transcriptions/{id}/download`. */
export interface DownloadUrlResponse {
  downloadUrl: string
}

/** In-memory + sessionStorage-persisted auth session. */
export interface AuthSession {
  idToken: string
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds when the access/id token expires. */
  expiresAt: number
  email: string
  userId: string
}

/** Narrow shape of errors surfaced to the UI from async operations. */
export interface AppError {
  message: string
  code?: string
}

/**
 * Lifecycle of a `pages/record.vue` real-time session. Shared between
 * `record.vue` (which drives it) and `LiveTranscript.vue` (which renders
 * it) so the two can't silently drift out of sync with two separately
 * hand-written unions.
 */
export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'stopping'
  | 'stopped'
  | 'error'

/**
 * Runtime guard for `AppError`-shaped values. `useApi()`/`useAuth()` both
 * guarantee everything they throw is already `AppError`-shaped, but call
 * sites shouldn't take that on faith with a blind `as AppError` cast —
 * this narrows it properly instead, so a genuinely unexpected error (e.g.
 * one that slipped past those wrappers) can't crash the UI on
 * `undefined.message`.
 */
export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  )
}

/** Safely turn a caught `unknown` into a displayable `AppError`, falling
 * back to `fallbackMessage` when it isn't already one. */
export function toDisplayError(err: unknown, fallbackMessage: string): AppError {
  return isAppError(err) ? err : { message: fallbackMessage }
}
