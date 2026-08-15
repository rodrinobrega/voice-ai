/**
 * Response helpers and request-parsing utilities shared by every handler.
 * Handlers should never build a raw `{ statusCode, headers, body }` object
 * by hand and should never import `@aws-sdk/*` — this file (plus
 * `shared/errors.ts`) is the only place that shapes an HTTP response.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { ZodSchema } from 'zod';
import { UnauthorizedError, ValidationError } from './errors';
import { CallerClaims, JSON_HEADERS } from './types';

function buildResponse<T>(statusCode: number, body: T): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function ok<T>(body: T): APIGatewayProxyStructuredResultV2 {
  return buildResponse(200, body);
}

export function created<T>(body: T): APIGatewayProxyStructuredResultV2 {
  return buildResponse(201, body);
}

export function badRequest(message: string): APIGatewayProxyStructuredResultV2 {
  return buildResponse(400, { message });
}

export function unauthorized(message = 'Unauthorized'): APIGatewayProxyStructuredResultV2 {
  return buildResponse(401, { message });
}

export function forbidden(message = 'Forbidden'): APIGatewayProxyStructuredResultV2 {
  return buildResponse(403, { message });
}

export function notFound(message = 'Not found'): APIGatewayProxyStructuredResultV2 {
  return buildResponse(404, { message });
}

export function serverError(message = 'Internal server error'): APIGatewayProxyStructuredResultV2 {
  return buildResponse(500, { message });
}

/**
 * Parses and validates a JSON request body against a zod schema, throwing a
 * `ValidationError` (caught by the handler's top-level catch and mapped to a
 * 400 by `errorToResponse`) on any failure.
 */
export function parseBody<T>(event: APIGatewayProxyEventV2, schema: ZodSchema<T>): T {
  if (!event.body) {
    throw new ValidationError('Request body is required');
  }
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf-8') : event.body;
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
    throw new ValidationError(message);
  }
  return result.data;
}

/**
 * Parses and validates the query string parameters against a zod schema.
 * API Gateway HTTP API v2 delivers query params as `Record<string, string>`.
 */
export function parseQuery<T>(event: APIGatewayProxyEventV2, schema: ZodSchema<T>): T {
  const raw = event.queryStringParameters ?? {};
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues.map((issue) => `${issue.path.join('.') || 'query'}: ${issue.message}`).join('; ');
    throw new ValidationError(message);
  }
  return result.data;
}

/** Reads a required path parameter (e.g. `{id}`), throwing `ValidationError` if absent. */
export function requirePathParam(event: APIGatewayProxyEventV2, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw new ValidationError(`Missing path parameter: ${name}`);
  }
  return value;
}

/**
 * Extracts the verified caller identity from the Cognito JWT authorizer
 * claims that API Gateway attaches to the request context. Never trusts a
 * client-supplied user id.
 */
export function getCallerClaims(event: APIGatewayProxyEventV2WithJWTAuthorizer): CallerClaims {
  const claims = event.requestContext.authorizer?.jwt?.claims;
  const sub = claims?.sub;
  const email = claims?.email;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new UnauthorizedError('Missing or invalid authentication claims');
  }
  return { sub, email: typeof email === 'string' ? email : '' };
}

/** Reads a request header case-insensitively (API Gateway HTTP API v2 lowercases them, but be defensive). */
export function getHeader(event: APIGatewayProxyEventV2, name: string): string | undefined {
  const target = name.toLowerCase();
  const headers = event.headers ?? {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      return value;
    }
  }
  return undefined;
}
