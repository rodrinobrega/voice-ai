import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

jest.mock('../../src/infra/dynamo');

import { handler } from '../../src/handlers/listTranscriptions';
import { queryTranscriptionsByUser } from '../../src/infra/dynamo';
import { decodeCursor, encodeCursor } from '../../src/domain/pagination';
import { Transcription } from '../../src/shared/types';

const mockedQuery = queryTranscriptionsByUser as jest.MockedFunction<typeof queryTranscriptionsByUser>;

function makeEvent(params: { claims?: Record<string, string>; query?: Record<string, string> }): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'GET /transcriptions',
    rawPath: '/transcriptions',
    rawQueryString: '',
    headers: {},
    queryStringParameters: params.query,
    isBase64Encoded: false,
    requestContext: {
      authorizer: params.claims ? { jwt: { claims: params.claims, scopes: [] } } : undefined,
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const sampleItem: Transcription = {
  transcriptionId: 'tx-1',
  userId: 'user-1',
  type: 'FILE',
  status: 'COMPLETED',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:05:00.000Z',
};

describe('handlers/listTranscriptions', () => {
  it('returns 200 with items and a null nextCursor when there is no further page', async () => {
    mockedQuery.mockResolvedValue({ items: [sampleItem], lastEvaluatedKey: undefined });
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({ items: [sampleItem], nextCursor: null });
  });

  it('defaults to the 10-item page size and queries the caller (not a client-supplied) userId', async () => {
    mockedQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' } });

    await handler(event);

    expect(mockedQuery).toHaveBeenCalledWith('user-1', 10, undefined);
  });

  it('encodes lastEvaluatedKey as an opaque nextCursor that decodes back to the exact same key', async () => {
    const lastEvaluatedKey = { PK: 'USER#user-1', SK: 'TRANSCRIPTION#2026-08-15T09:00:00.000Z#tx-0' };
    mockedQuery.mockResolvedValue({ items: [sampleItem], lastEvaluatedKey });
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' } });

    const response = await handler(event);

    const parsed = JSON.parse(response.body as string) as { nextCursor: string };
    expect(parsed.nextCursor).not.toBeNull();
    // Round-trip through the real decodeCursor rather than just asserting "is a string" —
    // proves the handler encoded the *actual* lastEvaluatedKey, not some other value.
    expect(decodeCursor(parsed.nextCursor)).toEqual(lastEvaluatedKey);
  });

  it('decodes an incoming cursor and passes it through as ExclusiveStartKey', async () => {
    const key = { PK: 'USER#user-1', SK: 'TRANSCRIPTION#2026-08-15T09:00:00.000Z#tx-0' };
    mockedQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, query: { cursor: encodeCursor(key) } });

    await handler(event);

    expect(mockedQuery).toHaveBeenCalledWith('user-1', 10, key);
  });

  it('caps the requested limit at the maximum page size via schema validation', async () => {
    mockedQuery.mockResolvedValue({ items: [], lastEvaluatedKey: undefined });
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, query: { limit: '50' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed cursor rather than throwing', async () => {
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, query: { cursor: 'not-a-real-cursor!!' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ claims: undefined });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
