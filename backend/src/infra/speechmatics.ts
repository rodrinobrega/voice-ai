/**
 * Speechmatics adapter — the only file that talks HTTP to the Speechmatics
 * batch/real-time management APIs. Uses Node 20's built-in `fetch`,
 * `FormData`, and `Blob` (no extra HTTP client dependency needed).
 */
import { Readable } from 'node:stream';
import { requireEnv } from '../shared/env';
import { UpstreamServiceError } from '../shared/errors';
import { REALTIME_LANGUAGES, REALTIME_TOKEN_TTL_SECONDS } from '../shared/types';
import { getSecureParam } from './ssm';

export type TranscriptFormat = 'txt' | 'json-v2';

/** Candidate set handed to Language Identification when `language === 'auto'`. */
const IDENTIFIABLE_LANGUAGES = REALTIME_LANGUAGES;

function baseUrl(): string {
  return requireEnv('SPEECHMATICS_BASE_URL');
}

/**
 * Temporary (real-time) keys are minted on the Speechmatics *Management* API
 * (`https://mp.speechmatics.com/v1`), which is a different host from the batch
 * ASR API (`https://asr.api.speechmatics.com/v2`) — hence its own env var.
 */
function managementBaseUrl(): string {
  return requireEnv('SPEECHMATICS_MGMT_URL');
}

async function apiKey(): Promise<string> {
  return getSecureParam(requireEnv('SPEECHMATICS_API_KEY_PARAM'));
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  // Cast once at the stream boundary (S3 GetObject bodies are always binary
  // Buffer chunks) instead of asserting the type of each individual chunk,
  // which would otherwise flow through as `any` (Node's `Readable` async
  // iterator is untyped) with no per-chunk validation.
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(response: Response): Promise<unknown> {
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export interface SubmitBatchJobParams {
  audio: Readable;
  filename: string;
  contentType: string;
  webhookUrl: string;
  webhookSecret: string;
  /** Speechmatics language code, or `auto` for Language Identification. */
  language: string;
}

/**
 * Submits a batch transcription job. The audio is buffered fully before the
 * multipart request is built — see the TODO comment on `infra/s3.ts`'s
 * `getObjectStream` for why, and what production would do instead.
 */
export async function submitBatchJob(params: SubmitBatchJobParams): Promise<{ jobId: string }> {
  const key = await apiKey();
  const buffer = await streamToBuffer(params.audio);

  const config = {
    type: 'transcription',
    // `language: 'auto'` enables Speechmatics' Language Identification, which
    // is batch-only and wants ~60s of speech to be reliable. Restricting it to
    // the codes the UI offers keeps detection from wandering into a language
    // this app never exposes.
    transcription_config: { language: params.language, operating_point: 'enhanced' },
    ...(params.language === 'auto'
      ? { language_identification_config: { expected_languages: [...IDENTIFIABLE_LANGUAGES] } }
      : {}),
    notification_config: [
      {
        url: params.webhookUrl,
        contentType: 'application/json',
        method: 'POST',
        auth_headers: [`x-webhook-secret: ${params.webhookSecret}`],
      },
    ],
  };

  const form = new FormData();
  // `new Uint8Array(buffer)` rather than the Buffer itself: under @types/node 22
  // a Buffer is `Uint8Array<ArrayBufferLike>`, which doesn't satisfy `BlobPart`
  // (that requires an `ArrayBuffer`-backed view, not a possibly-shared one).
  form.append('data_file', new Blob([new Uint8Array(buffer)], { type: params.contentType }), params.filename);
  form.append('config', JSON.stringify(config));

  const response = await fetch(`${baseUrl()}/jobs`, {
    method: 'POST',
    headers: authHeaders(key),
    body: form,
  });
  if (!response.ok) {
    throw new UpstreamServiceError(`Speechmatics job submission failed with status ${response.status}`);
  }

  const data = await readJson(response);
  if (!isRecord(data) || typeof data.id !== 'string' || data.id.length === 0) {
    throw new UpstreamServiceError('Speechmatics job submission response was missing a valid "id"');
  }
  return { jobId: data.id };
}

/** Fetches a finished job's transcript in the given format (`txt` or `json-v2`). */
export async function getJobTranscript(jobId: string, format: TranscriptFormat): Promise<string> {
  const key = await apiKey();
  const response = await fetch(`${baseUrl()}/jobs/${encodeURIComponent(jobId)}/transcript?format=${format}`, {
    headers: authHeaders(key),
  });
  if (!response.ok) {
    throw new UpstreamServiceError(`Speechmatics transcript fetch failed with status ${response.status}`);
  }
  return response.text();
}

interface LanguageIdentificationResult {
  language: string;
  confidence: number;
}

function toIdentificationResult(value: unknown): LanguageIdentificationResult | null {
  if (!isRecord(value) || typeof value.language !== 'string' || value.language.length === 0) {
    return null;
  }
  return { language: value.language, confidence: typeof value.confidence === 'number' ? value.confidence : 0 };
}

/**
 * Reads the language a finished job was actually transcribed in out of its
 * `json-v2` transcript.
 *
 * For a Language Identification job the submitted config still reads `auto`,
 * and the identified code appears only under
 * `metadata.language_identification.results`. Speechmatics documents those as
 * confidence-ordered, but we pick the maximum explicitly rather than depend on
 * the ordering. For a job submitted with an explicit language, the code is
 * echoed back on `metadata.transcription_config.language`.
 *
 * Returns `undefined` for anything missing or unparseable — not knowing the
 * language is not worth failing an otherwise successful transcription over.
 */
export function extractDetectedLanguage(transcriptJson: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(transcriptJson);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed.metadata)) {
    return undefined;
  }
  return identifiedLanguage(parsed.metadata) ?? configuredLanguage(parsed.metadata);
}

/** Highest-confidence entry of `metadata.language_identification.results`, if any. */
function identifiedLanguage(metadata: Record<string, unknown>): string | undefined {
  const results = isRecord(metadata.language_identification) ? metadata.language_identification.results : undefined;
  if (!Array.isArray(results)) {
    return undefined;
  }

  let best: LanguageIdentificationResult | null = null;
  for (const entry of results) {
    const result = toIdentificationResult(entry);
    if (result && (!best || result.confidence > best.confidence)) {
      best = result;
    }
  }
  return best?.language;
}

/** The language echoed back on `metadata.transcription_config`, ignoring `auto`. */
function configuredLanguage(metadata: Record<string, unknown>): string | undefined {
  const configured = isRecord(metadata.transcription_config) ? metadata.transcription_config.language : undefined;
  return typeof configured === 'string' && configured.length > 0 && configured !== 'auto' ? configured : undefined;
}

/** Polls a job's current status directly (used by the stuck-transcription fallback). */
export async function getJobStatus(jobId: string): Promise<{ status: string }> {
  const key = await apiKey();
  const response = await fetch(`${baseUrl()}/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(key),
  });
  if (!response.ok) {
    throw new UpstreamServiceError(`Speechmatics job status fetch failed with status ${response.status}`);
  }
  const data = await readJson(response);
  const status = isRecord(data) && isRecord(data.job) && typeof data.job.status === 'string' ? data.job.status : undefined;
  if (!status) {
    throw new UpstreamServiceError('Speechmatics job status response was missing a valid "job.status"');
  }
  return { status };
}

/**
 * Mints a short-lived, real-time-scoped temporary API key via the
 * Speechmatics Management API. The permanent key never leaves this adapter.
 */
export async function mintRealtimeToken(): Promise<{ token: string }> {
  const key = await apiKey();
  const response = await fetch(`${managementBaseUrl()}/api_keys?type=rt`, {
    method: 'POST',
    headers: { ...authHeaders(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: REALTIME_TOKEN_TTL_SECONDS }),
  });
  if (!response.ok) {
    throw new UpstreamServiceError(`Speechmatics temporary key creation failed with status ${response.status}`);
  }
  const data = await readJson(response);
  if (!isRecord(data) || typeof data.key_value !== 'string' || data.key_value.length === 0) {
    throw new UpstreamServiceError('Speechmatics temporary key response was missing a valid "key_value"');
  }
  return { token: data.key_value };
}
