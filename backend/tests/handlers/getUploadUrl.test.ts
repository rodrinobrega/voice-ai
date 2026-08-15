import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

jest.mock('../../src/infra/dynamo');
jest.mock('../../src/infra/s3');

import { handler } from '../../src/handlers/getUploadUrl';
import { putTranscription } from '../../src/infra/dynamo';
import { createAudioUploadPost } from '../../src/infra/s3';

const mockedPutTranscription = putTranscription as jest.MockedFunction<typeof putTranscription>;
const mockedCreateAudioUploadPost = createAudioUploadPost as jest.MockedFunction<typeof createAudioUploadPost>;

function makeEvent(params: {
  body?: unknown;
  claims?: Record<string, string>;
}): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'POST /transcriptions/upload-url',
    rawPath: '/transcriptions/upload-url',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
    isBase64Encoded: false,
    requestContext: {
      authorizer: params.claims ? { jwt: { claims: params.claims, scopes: [] } } : undefined,
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe('handlers/getUploadUrl', () => {
  beforeEach(() => {
    mockedCreateAudioUploadPost.mockResolvedValue({
      url: 'https://voice-ai-audio-dev.s3.amazonaws.com/',
      fields: { key: 'audio/user-1/generated-id/song.mp3', policy: 'abc', signature: 'xyz' },
    });
    mockedPutTranscription.mockResolvedValue(undefined);
  });

  it('returns 200 with transcriptionId/uploadUrl/fields for a valid authenticated request', async () => {
    const event = makeEvent({
      claims: { sub: 'user-1', email: 'user@example.com' },
      body: { filename: 'song.mp3', contentType: 'audio/mpeg' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    const parsed = JSON.parse(response.body as string) as { transcriptionId: string; uploadUrl: string; fields: unknown };
    expect(typeof parsed.transcriptionId).toBe('string');
    expect(parsed.transcriptionId.length).toBeGreaterThan(0);
    expect(parsed.uploadUrl).toBe('https://voice-ai-audio-dev.s3.amazonaws.com/');
    expect(parsed.fields).toEqual({ key: 'audio/user-1/generated-id/song.mp3', policy: 'abc', signature: 'xyz' });
  });

  it('writes a PENDING_UPLOAD DynamoDB item scoped to the caller before presigning', async () => {
    const event = makeEvent({
      claims: { sub: 'user-1', email: 'user@example.com' },
      body: { filename: 'song.mp3', contentType: 'audio/mpeg' },
    });

    await handler(event);

    expect(mockedPutTranscription).toHaveBeenCalledTimes(1);
    const written = mockedPutTranscription.mock.calls[0][0];
    expect(written.userId).toBe('user-1');
    expect(written.status).toBe('PENDING_UPLOAD');
    expect(written.type).toBe('FILE');
    expect(written.audioS3Key).toContain('audio/user-1/');
    expect(written.audioS3Key).toContain('/song.mp3');
  });

  it('returns 401 when the request has no authenticated caller', async () => {
    const event = makeEvent({ claims: undefined, body: { filename: 'song.mp3', contentType: 'audio/mpeg' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(mockedPutTranscription).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing filename', async () => {
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, body: { contentType: 'audio/mpeg' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedPutTranscription).not.toHaveBeenCalled();
  });

  it('returns 400 for a contentType containing CRLF / header-injection-style characters, even though it starts with audio/', async () => {
    const event = makeEvent({
      claims: { sub: 'user-1', email: 'e' },
      body: { filename: 'song.mp3', contentType: 'audio/mpeg\r\nX-Injected-Header: evil' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedCreateAudioUploadPost).not.toHaveBeenCalled();
  });

  it('returns 400 when contentType does not start with audio/', async () => {
    const event = makeEvent({
      claims: { sub: 'user-1', email: 'e' },
      body: { filename: 'song.mp3', contentType: 'application/pdf' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedCreateAudioUploadPost).not.toHaveBeenCalled();
  });

  it('returns 500 when the DynamoDB write fails, without leaking internal error details', async () => {
    mockedPutTranscription.mockRejectedValueOnce(new Error('table is on fire'));
    const event = makeEvent({
      claims: { sub: 'user-1', email: 'e' },
      body: { filename: 'song.mp3', contentType: 'audio/mpeg' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({ message: 'Internal server error' });
  });
});
