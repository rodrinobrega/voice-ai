/**
 * Cursor encode/decode for `listTranscriptions` pagination. DynamoDB
 * pagination is key-based (`LastEvaluatedKey` / `ExclusiveStartKey`), not
 * offset-based; we base64url-encode that key so the frontend can treat it as
 * an opaque string.
 *
 * Pure functions, no AWS SDK dependency — this is the file's whole reason to
 * exist as a `domain/` module rather than living inline in `infra/dynamo.ts`.
 */
import { ValidationError } from '../shared/errors';

/** The table's primary key shape — the only fields a `LastEvaluatedKey` can contain in this schema. */
export interface TranscriptionKey {
  PK: string;
  SK: string;
}

function isTranscriptionKey(value: unknown): value is TranscriptionKey {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.PK === 'string' && record.PK.length > 0 && typeof record.SK === 'string' && record.SK.length > 0;
}

/** Encodes a DynamoDB `LastEvaluatedKey` into an opaque cursor string. */
export function encodeCursor(key: TranscriptionKey): string {
  return Buffer.from(JSON.stringify(key), 'utf-8').toString('base64url');
}

/**
 * Decodes an opaque cursor string back into a DynamoDB key.
 * Throws `ValidationError` for any malformed input (not base64, not JSON,
 * missing PK/SK) so handlers can surface a clean 400 rather than a 500.
 */
export function decodeCursor(cursor: string): TranscriptionKey {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
  } catch {
    throw new ValidationError('Invalid pagination cursor');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new ValidationError('Invalid pagination cursor');
  }

  if (!isTranscriptionKey(parsed)) {
    throw new ValidationError('Invalid pagination cursor');
  }

  return parsed;
}
