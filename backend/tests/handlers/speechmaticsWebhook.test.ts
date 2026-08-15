import type { APIGatewayProxyEventV2 } from 'aws-lambda';

jest.mock('../../src/infra/dynamo');
jest.mock('../../src/infra/s3');
jest.mock('../../src/infra/speechmatics');
jest.mock('../../src/infra/ssm');

import { handler } from '../../src/handlers/speechmaticsWebhook';
import { getTranscriptionById, updateTranscriptionStatus } from '../../src/infra/dynamo';
import { persistTranscriptOutputs } from '../../src/infra/s3';
import { getJobTranscript } from '../../src/infra/speechmatics';
import { getSecureParam } from '../../src/infra/ssm';
import { Transcription } from '../../src/shared/types';

const mockedGetTranscriptionById = getTranscriptionById as jest.MockedFunction<typeof getTranscriptionById>;
const mockedUpdateStatus = updateTranscriptionStatus as jest.MockedFunction<typeof updateTranscriptionStatus>;
const mockedPersist = persistTranscriptOutputs as jest.MockedFunction<typeof persistTranscriptOutputs>;
const mockedGetJobTranscript = getJobTranscript as jest.MockedFunction<typeof getJobTranscript>;
const mockedGetSecureParam = getSecureParam as jest.MockedFunction<typeof getSecureParam>;

const REAL_SECRET = 'super-secret-webhook-value';

const processingTranscription: Transcription = {
  transcriptionId: 'tx-1',
  userId: 'user-1',
  type: 'FILE',
  status: 'PROCESSING',
  speechmaticsJobId: 'job-1',
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T10:00:00.000Z',
};

function makeEvent(params: {
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /transcriptions/webhook',
    rawPath: '/transcriptions/webhook',
    rawQueryString: '',
    headers: params.headers ?? {},
    queryStringParameters: params.query,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
    isBase64Encoded: false,
    requestContext: {},
  } as unknown as APIGatewayProxyEventV2;
}

describe('handlers/speechmaticsWebhook', () => {
  beforeEach(() => {
    mockedGetSecureParam.mockResolvedValue(REAL_SECRET);
    mockedGetTranscriptionById.mockResolvedValue(processingTranscription);
    mockedUpdateStatus.mockResolvedValue(undefined);
    mockedPersist.mockResolvedValue({ textKey: 'user-1/tx-1.txt', jsonKey: 'user-1/tx-1.json' });
    mockedGetJobTranscript.mockResolvedValue('hello world');
  });

  it('returns 401 and never looks up the transcription when the secret header is missing', async () => {
    const event = makeEvent({ query: { transcriptionId: 'tx-1', userId: 'user-1' }, body: { id: 'job-1', status: 'done' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(mockedGetTranscriptionById).not.toHaveBeenCalled();
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
  });

  it('returns 401 when the secret header does not match the stored secret', async () => {
    const event = makeEvent({
      headers: { 'x-webhook-secret': 'totally-wrong-value' },
      query: { transcriptionId: 'tx-1', userId: 'user-1' },
      body: { id: 'job-1', status: 'done' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
  });

  it('rejects a secret that differs only in length from the real one (would defeat a naive prefix check)', async () => {
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET.slice(0, -1) },
      query: { transcriptionId: 'tx-1', userId: 'user-1' },
      body: { id: 'job-1', status: 'done' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(401);
  });

  it('accepts a matching secret and marks the transcription COMPLETED on a success status', async () => {
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET },
      query: { transcriptionId: 'tx-1', userId: 'user-1' },
      body: { id: 'job-1', status: 'done' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockedGetJobTranscript).toHaveBeenCalledWith('job-1', 'txt');
    expect(mockedGetJobTranscript).toHaveBeenCalledWith('job-1', 'json-v2');
    expect(mockedUpdateStatus).toHaveBeenCalledWith('tx-1', { status: 'COMPLETED', transcriptS3Key: 'user-1/tx-1.txt' });
  });

  it('marks the transcription FAILED (with a message) on a failure status, without fetching a transcript', async () => {
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET },
      query: { transcriptionId: 'tx-1', userId: 'user-1' },
      body: { id: 'job-1', status: 'rejected' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockedGetJobTranscript).not.toHaveBeenCalled();
    expect(mockedUpdateStatus).toHaveBeenCalledWith('tx-1', { status: 'FAILED', errorMessage: 'Speechmatics job rejected' });
  });

  it('returns 400 when required correlation query params are missing', async () => {
    const event = makeEvent({ headers: { 'x-webhook-secret': REAL_SECRET }, query: {}, body: { id: 'job-1', status: 'done' } });

    const response = await handler(event);

    expect(response.statusCode).toBe(400);
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
  });

  it('acknowledges (200) but does not update anything for an unrecognized status', async () => {
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET },
      query: { transcriptionId: 'tx-1', userId: 'user-1' },
      body: { id: 'job-1', status: 'queued' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
  });

  it('acknowledges with 200 (not 404) for an unknown transcriptionId, so Speechmatics does not retry forever', async () => {
    mockedGetTranscriptionById.mockResolvedValueOnce(null);
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET },
      query: { transcriptionId: 'does-not-exist', userId: 'user-1' },
      body: { id: 'job-1', status: 'done' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
  });

  it('ignores the callback when the correlation userId does not match the stored transcription owner', async () => {
    mockedGetTranscriptionById.mockResolvedValueOnce({ ...processingTranscription, userId: 'user-1' });
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET },
      query: { transcriptionId: 'tx-1', userId: 'attacker-2' },
      body: { id: 'job-1', status: 'done' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
    expect(mockedGetJobTranscript).not.toHaveBeenCalled();
  });

  it('ignores a callback whose job id does not match the transcription\'s recorded job id (stale/duplicate delivery)', async () => {
    mockedGetTranscriptionById.mockResolvedValueOnce({ ...processingTranscription, speechmaticsJobId: 'job-current' });
    const event = makeEvent({
      headers: { 'x-webhook-secret': REAL_SECRET },
      query: { transcriptionId: 'tx-1', userId: 'user-1' },
      body: { id: 'job-stale', status: 'done' },
    });

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(mockedUpdateStatus).not.toHaveBeenCalled();
  });
});
