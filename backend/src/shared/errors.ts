/**
 * Typed error hierarchy shared by every handler's top-level try/catch, plus
 * `errorToResponse`, the single place that maps a thrown error to an API
 * Gateway HTTP API v2 proxy response.
 *
 * Deliberately does not import from `./http` to avoid a circular dependency
 * (http.ts's `parseBody` throws `ValidationError` from this module).
 */
import { JSON_HEADERS } from './types';

export interface ErrorResponseBody {
  message: string;
}

export interface ProxyResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

/** Base class for every error that carries an intentional HTTP status code. */
export abstract class VoiceAiError extends Error {
  abstract readonly statusCode: number;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Request failed validation (bad body, bad query params, bad cursor). */
export class ValidationError extends VoiceAiError {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
  }
}

/** Caller could not be authenticated (missing/invalid claims, bad webhook secret). */
export class UnauthorizedError extends VoiceAiError {
  readonly statusCode = 401;

  constructor(message = 'Unauthorized') {
    super(message);
  }
}

/** Caller is authenticated but does not own the requested resource. */
export class ForbiddenError extends VoiceAiError {
  readonly statusCode = 403;

  constructor(message = 'Forbidden') {
    super(message);
  }
}

/** Requested resource does not exist. */
export class NotFoundError extends VoiceAiError {
  readonly statusCode = 404;

  constructor(message = 'Not found') {
    super(message);
  }
}

/** A downstream dependency (Speechmatics, S3) failed in a way we can't recover from inline. */
export class UpstreamServiceError extends VoiceAiError {
  readonly statusCode = 502;

  constructor(message: string) {
    super(message);
  }
}

function buildErrorResponse(statusCode: number, message: string): ProxyResult {
  const body: ErrorResponseBody = { message };
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/**
 * Maps any thrown value to a well-formed API Gateway HTTP API v2 proxy
 * response. Unknown/unexpected errors are collapsed to a generic 500 message
 * so internal details never leak to a caller.
 */
export function errorToResponse(error: unknown): ProxyResult {
  if (error instanceof VoiceAiError) {
    return buildErrorResponse(error.statusCode, error.message);
  }
  return buildErrorResponse(500, 'Internal server error');
}
