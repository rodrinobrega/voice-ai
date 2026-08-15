/**
 * Focused tests for the status-transition guard added to
 * `updateTranscriptionStatus` (previously untested infra code), plus the
 * `requireEnum` defensive parsing in `fromItem`. Mocks the DynamoDB SDK at
 * the `.send()` boundary rather than mocking our own module, so the actual
 * command-building and guard logic under test is real.
 */
process.env.DYNAMODB_TABLE = 'voice-ai-transcriptions-test';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: { from: jest.fn(() => ({ send: mockSend })) },
  };
});

import { getTranscriptionById, updateTranscriptionStatus } from '../../src/infra/dynamo';
import { NotFoundError } from '../../src/shared/errors';

function itemFixture(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    PK: 'USER#user-1',
    SK: 'TRANSCRIPTION#2026-08-15T10:00:00.000Z#tx-1',
    GSI1PK: 'tx-1',
    transcriptionId: 'tx-1',
    userId: 'user-1',
    type: 'FILE',
    status: 'PROCESSING',
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('infra/dynamo — updateTranscriptionStatus transition guard', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('allows a legal transition (PROCESSING -> COMPLETED) and issues the UpdateCommand', async () => {
    mockSend
      .mockResolvedValueOnce({ Items: [itemFixture({ status: 'PROCESSING' })] }) // GSI1 lookup
      .mockResolvedValueOnce({}); // UpdateCommand

    await updateTranscriptionStatus('tx-1', { status: 'COMPLETED', transcriptS3Key: 'user-1/tx-1.txt' });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const updateCall = mockSend.mock.calls[1][0] as { input: Record<string, unknown> };
    expect(updateCall.input.Key).toEqual({ PK: 'USER#user-1', SK: 'TRANSCRIPTION#2026-08-15T10:00:00.000Z#tx-1' });
    expect(updateCall.input.ExpressionAttributeValues).toMatchObject({ ':status': 'COMPLETED' });
  });

  it('silently skips an illegal transition (COMPLETED -> PROCESSING) without writing', async () => {
    mockSend.mockResolvedValueOnce({ Items: [itemFixture({ status: 'COMPLETED' })] }); // GSI1 lookup only

    await updateTranscriptionStatus('tx-1', { status: 'PROCESSING', speechmaticsJobId: 'job-99' });

    // Only the lookup Query ran — no UpdateCommand should have been sent for an illegal transition.
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('silently skips a re-delivery into a terminal state (FAILED -> COMPLETED is not a valid outgoing FAILED transition)', async () => {
    mockSend.mockResolvedValueOnce({ Items: [itemFixture({ status: 'FAILED' })] });

    await updateTranscriptionStatus('tx-1', { status: 'COMPLETED', transcriptS3Key: 'user-1/tx-1.txt' });

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('allows a same-status update to proceed (idempotent duplicate webhook delivery is not blocked by mistake)', async () => {
    mockSend.mockResolvedValueOnce({ Items: [itemFixture({ status: 'COMPLETED' })] }).mockResolvedValueOnce({});

    await updateTranscriptionStatus('tx-1', { status: 'COMPLETED', transcriptS3Key: 'user-1/tx-1.txt' });

    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('throws NotFoundError when no item exists for the given transcriptionId', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    await expect(updateTranscriptionStatus('missing-id', { status: 'COMPLETED' })).rejects.toThrow(NotFoundError);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe('infra/dynamo — getTranscriptionById defensive item parsing', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('maps a well-formed item to a Transcription', async () => {
    mockSend.mockResolvedValueOnce({ Items: [itemFixture()] });

    const result = await getTranscriptionById('tx-1');

    expect(result).toMatchObject({ transcriptionId: 'tx-1', userId: 'user-1', type: 'FILE', status: 'PROCESSING' });
  });

  it('returns null when no item is found', async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });

    expect(await getTranscriptionById('missing-id')).toBeNull();
  });

  it('throws rather than silently accepting a corrupted/invalid status value', async () => {
    mockSend.mockResolvedValueOnce({ Items: [itemFixture({ status: 'NOT_A_REAL_STATUS' })] });

    await expect(getTranscriptionById('tx-1')).rejects.toThrow(/invalid value for field "status"/);
  });

  it('throws rather than silently accepting a corrupted/invalid type value', async () => {
    mockSend.mockResolvedValueOnce({ Items: [itemFixture({ type: 'NOT_A_REAL_TYPE' })] });

    await expect(getTranscriptionById('tx-1')).rejects.toThrow(/invalid value for field "type"/);
  });
});
