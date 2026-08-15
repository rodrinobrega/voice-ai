import type { APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { z } from 'zod';
import {
  badRequest,
  forbidden,
  getCallerClaims,
  getHeader,
  notFound,
  ok,
  parseBody,
  parseQuery,
  requirePathParam,
  serverError,
  unauthorized,
} from '../../src/shared/http';
import { UnauthorizedError, ValidationError } from '../../src/shared/errors';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/',
    rawQueryString: '',
    headers: {},
    requestContext: {} as APIGatewayProxyEventV2['requestContext'],
    isBase64Encoded: false,
    ...overrides,
  } as APIGatewayProxyEventV2;
}

describe('shared/http — response helpers', () => {
  it('ok() returns a 200 with a JSON content-type header and serialized body', () => {
    const response = ok({ hello: 'world' });
    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(response.body as string)).toEqual({ hello: 'world' });
  });

  it('badRequest() returns a 400 with the given message', () => {
    const response = badRequest('nope');
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body as string)).toEqual({ message: 'nope' });
  });

  it('unauthorized() defaults to a generic message', () => {
    const response = unauthorized();
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body as string)).toEqual({ message: 'Unauthorized' });
  });

  it('forbidden() returns a 403', () => {
    expect(forbidden('denied').statusCode).toBe(403);
  });

  it('notFound() returns a 404', () => {
    expect(notFound().statusCode).toBe(404);
  });

  it('serverError() returns a 500 without leaking internal details by default', () => {
    const response = serverError();
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({ message: 'Internal server error' });
  });
});

describe('shared/http — parseBody', () => {
  const schema = z.object({ filename: z.string().min(1) });

  it('parses and validates a well-formed JSON body', () => {
    const event = makeEvent({ body: JSON.stringify({ filename: 'a.mp3' }) });
    expect(parseBody(event, schema)).toEqual({ filename: 'a.mp3' });
  });

  it('decodes a base64-encoded body before parsing', () => {
    const event = makeEvent({
      body: Buffer.from(JSON.stringify({ filename: 'a.mp3' }), 'utf-8').toString('base64'),
      isBase64Encoded: true,
    });
    expect(parseBody(event, schema)).toEqual({ filename: 'a.mp3' });
  });

  it('throws ValidationError when the body is missing', () => {
    const event = makeEvent({ body: undefined });
    expect(() => parseBody(event, schema)).toThrow(ValidationError);
  });

  it('throws ValidationError when the body is not valid JSON', () => {
    const event = makeEvent({ body: '{not json' });
    expect(() => parseBody(event, schema)).toThrow(ValidationError);
  });

  it('throws ValidationError when the body fails schema validation', () => {
    const event = makeEvent({ body: JSON.stringify({ filename: '' }) });
    expect(() => parseBody(event, schema)).toThrow(ValidationError);
  });
});

describe('shared/http — parseQuery', () => {
  const schema = z.object({ limit: z.coerce.number().optional() });

  it('parses valid query string parameters', () => {
    const event = makeEvent({ queryStringParameters: { limit: '5' } });
    expect(parseQuery(event, schema)).toEqual({ limit: 5 });
  });

  it('treats missing query string parameters as an empty object', () => {
    const event = makeEvent({ queryStringParameters: undefined });
    expect(parseQuery(event, schema)).toEqual({});
  });
});

describe('shared/http — requirePathParam', () => {
  it('returns the parameter value when present', () => {
    const event = makeEvent({ pathParameters: { id: 'tx-1' } });
    expect(requirePathParam(event, 'id')).toBe('tx-1');
  });

  it('throws ValidationError when the parameter is missing', () => {
    const event = makeEvent({ pathParameters: {} });
    expect(() => requirePathParam(event, 'id')).toThrow(ValidationError);
  });
});

describe('shared/http — getCallerClaims', () => {
  function makeAuthorizedEvent(claims: Record<string, string> | undefined): APIGatewayProxyEventV2WithJWTAuthorizer {
    return makeEvent({
      requestContext: {
        authorizer: claims ? { jwt: { claims, scopes: [] } } : undefined,
      } as unknown as APIGatewayProxyEventV2['requestContext'],
    }) as APIGatewayProxyEventV2WithJWTAuthorizer;
  }

  it('extracts sub and email from verified JWT claims', () => {
    const event = makeAuthorizedEvent({ sub: 'user-1', email: 'user@example.com' });
    expect(getCallerClaims(event)).toEqual({ sub: 'user-1', email: 'user@example.com' });
  });

  it('defaults email to an empty string when the claim is absent', () => {
    const event = makeAuthorizedEvent({ sub: 'user-1' });
    expect(getCallerClaims(event)).toEqual({ sub: 'user-1', email: '' });
  });

  it('throws UnauthorizedError when sub claim is missing', () => {
    const event = makeAuthorizedEvent(undefined);
    expect(() => getCallerClaims(event)).toThrow(UnauthorizedError);
  });
});

describe('shared/http — getHeader', () => {
  it('matches header names case-insensitively', () => {
    const event = makeEvent({ headers: { 'X-Webhook-Secret': 'abc123' } });
    expect(getHeader(event, 'x-webhook-secret')).toBe('abc123');
  });

  it('returns undefined when the header is absent', () => {
    const event = makeEvent({ headers: {} });
    expect(getHeader(event, 'x-webhook-secret')).toBeUndefined();
  });
});
