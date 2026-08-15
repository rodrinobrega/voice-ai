import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

jest.mock('../../src/infra/dynamo');
jest.mock('../../src/infra/s3');

import { handler } from '../../src/handlers/getDownloadUrl';
import { getTranscriptionById } from '../../src/infra/dynamo';
import { getTranscriptDownloadUrl } from '../../src/infra/s3';
import { Transcription } from '../../src/shared/types';

const mockedGetTranscriptionById = getTranscriptionById as jest.MockedFunction<typeof getTranscriptionById>;
const mockedGetTranscriptDownloadUrl = getTranscriptDownloadUrl as jest.MockedFunction<typeof getTranscriptDownloadUrl>;

function makeEvent(params: { claims?: Record<string, string>; id?: string }): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: 'GET /transcriptions/{id}/download',
    rawPath: `/transcriptions/${params.id ?? ''}/download`,
    rawQueryString: '',
    headers: {},
    pathParameters: params.id ? { id: params.id } : undefined,
    isBase64Encoded: false,
    requestContext: {
      authorizer: params.claims ? { jwt: { claims: params.claims, scopes: [] } } : undefined,
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

const completedTranscription: Transcription = {
  transcriptionId: 'tx-1',
  userId: 'user-1',
  type: 'FILE',
  status: 'COMPLETED',
  transcriptS3Key: 'user-1/tx-1.txt',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:05:00.000Z',
};

describe('handlers/getDownloadUrl', () => {
  it('returns 200 with a presigned downloadUrl for the resource owner', async () => {
    mockedGetTranscriptionById.mockResolvedValue(completedTranscription);
    mockedGetTranscriptDownloadUrl.mockResolvedValue('https://voice-ai-transcripts-dev.s3.amazonaws.com/user-1/tx-1.txt?signed=1');
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, id: 'tx-1' });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body as string)).toEqual({
      downloadUrl: 'https://voice-ai-transcripts-dev.s3.amazonaws.com/user-1/tx-1.txt?signed=1',
    });
    expect(mockedGetTranscriptDownloadUrl).toHaveBeenCalledWith('user-1/tx-1.txt');
  });

  it('returns 403 and does not presign anything when a different user requests it (ownership rejection)', async () => {
    mockedGetTranscriptionById.mockResolvedValue(completedTranscription);
    const event = makeEvent({ claims: { sub: 'attacker-2', email: 'e' }, id: 'tx-1' });

    const response = await handler(event);

    expect(response.statusCode).toBe(403);
    expect(mockedGetTranscriptDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns 404 when the transcription does not exist', async () => {
    mockedGetTranscriptionById.mockResolvedValue(null);
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, id: 'missing-id' });

    const response = await handler(event);

    expect(response.statusCode).toBe(404);
    expect(mockedGetTranscriptDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns 400 when the transcript is not ready yet (no transcriptS3Key)', async () => {
    mockedGetTranscriptionById.mockResolvedValue({ ...completedTranscription, status: 'PROCESSING', transcriptS3Key: undefined });
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, id: 'tx-1' });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedGetTranscriptDownloadUrl).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    const event = makeEvent({ claims: undefined, id: 'tx-1' });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(mockedGetTranscriptionById).not.toHaveBeenCalled();
  });

  it('returns 400 when the id path parameter is missing', async () => {
    const event = makeEvent({ claims: { sub: 'user-1', email: 'e' }, id: undefined });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedGetTranscriptionById).not.toHaveBeenCalled();
  });
});
