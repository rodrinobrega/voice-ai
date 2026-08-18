/**
 * Framework-agnostic transcription business logic: id generation, S3/DynamoDB
 * key builders, status-transition rules, and factory helpers for creating a
 * new `Transcription` in its initial state.
 */
import { v4 as uuidv4 } from 'uuid';
import { Transcription, TranscriptionStatus } from '../shared/types';

const FILENAME_SAFE_PATTERN = /[^a-zA-Z0-9._-]/g;
const AUDIO_KEY_PATTERN = /^audio\/([^/]+)\/([^/]+)\/[^/]+$/;

export function generateTranscriptionId(): string {
  return uuidv4();
}

/** Strips characters that are awkward/unsafe in an S3 key or as a header value. */
function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(FILENAME_SAFE_PATTERN, '_');
  return sanitized.length > 0 ? sanitized : 'audio';
}

/** `audio/{userId}/{transcriptionId}/{filename}` — the audio bucket key convention. */
export function buildAudioKey(userId: string, transcriptionId: string, filename: string): string {
  return `audio/${userId}/${transcriptionId}/${sanitizeFilename(filename)}`;
}

/** `{userId}/{transcriptionId}.txt` — the transcripts bucket key convention (plain text). */
export function buildTranscriptTextKey(userId: string, transcriptionId: string): string {
  return `${userId}/${transcriptionId}.txt`;
}

/** `{userId}/{transcriptionId}.json` — the transcripts bucket key convention (Speechmatics json-v2). */
export function buildTranscriptJsonKey(userId: string, transcriptionId: string): string {
  return `${userId}/${transcriptionId}.json`;
}

/** `USER#{userId}` — table partition key. */
export function buildPartitionKey(userId: string): string {
  return `USER#${userId}`;
}

/** `TRANSCRIPTION#{createdAtISO}#{transcriptionId}` — table sort key, sortable by recency. */
export function buildSortKey(createdAt: string, transcriptionId: string): string {
  return `TRANSCRIPTION#${createdAt}#${transcriptionId}`;
}

/**
 * Parses `audio/{userId}/{transcriptionId}/{filename}` out of an S3 object
 * key. Returns `null` (rather than throwing) for a key that doesn't match
 * the convention, since the caller (an S3 event handler) should log and skip
 * rather than crash the whole batch.
 */
export function extractIdsFromAudioKey(key: string): { userId: string; transcriptionId: string } | null {
  const match = AUDIO_KEY_PATTERN.exec(key);
  if (!match) {
    return null;
  }
  return { userId: match[1], transcriptionId: match[2] };
}

const VALID_STATUS_TRANSITIONS: Record<TranscriptionStatus, readonly TranscriptionStatus[]> = {
  PENDING_UPLOAD: ['PROCESSING', 'FAILED'],
  PROCESSING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
};

/** Whether moving a transcription from one status to another is a legal transition. */
export function canTransition(from: TranscriptionStatus, to: TranscriptionStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

/** `COMPLETED` and `FAILED` are terminal — nothing should transition out of them. */
export function isTerminalStatus(status: TranscriptionStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

export interface NewFileTranscriptionInput {
  transcriptionId: string;
  userId: string;
  sourceFileName: string;
  audioS3Key: string;
  now: string;
  language?: string;
}

/** Builds a brand-new `FILE` transcription in `PENDING_UPLOAD` state. */
export function createFileTranscription(input: NewFileTranscriptionInput): Transcription {
  return {
    transcriptionId: input.transcriptionId,
    userId: input.userId,
    type: 'FILE',
    status: 'PENDING_UPLOAD',
    sourceFileName: input.sourceFileName,
    audioS3Key: input.audioS3Key,
    language: input.language,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export interface NewRealtimeTranscriptionInput {
  transcriptionId: string;
  userId: string;
  transcriptS3Key: string;
  now: string;
  durationSeconds?: number;
  language?: string;
}

/** Builds a brand-new `REALTIME` transcription, already `COMPLETED` (the client only calls this once it has the final text). */
export function createRealtimeTranscription(input: NewRealtimeTranscriptionInput): Transcription {
  return {
    transcriptionId: input.transcriptionId,
    userId: input.userId,
    type: 'REALTIME',
    status: 'COMPLETED',
    transcriptS3Key: input.transcriptS3Key,
    durationSeconds: input.durationSeconds,
    language: input.language,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
