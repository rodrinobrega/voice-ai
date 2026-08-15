import {
  buildAudioKey,
  buildPartitionKey,
  buildSortKey,
  buildTranscriptJsonKey,
  buildTranscriptTextKey,
  canTransition,
  createFileTranscription,
  createRealtimeTranscription,
  extractIdsFromAudioKey,
  generateTranscriptionId,
  isTerminalStatus,
} from '../../src/domain/transcription';

describe('domain/transcription — key builders', () => {
  it('builds the audio key convention audio/{userId}/{transcriptionId}/{filename}', () => {
    expect(buildAudioKey('user-1', 'tx-1', 'song.mp3')).toBe('audio/user-1/tx-1/song.mp3');
  });

  it('sanitizes unsafe characters out of the filename', () => {
    expect(buildAudioKey('user-1', 'tx-1', 'my recording (final)!.wav')).toBe('audio/user-1/tx-1/my_recording__final__.wav');
  });

  it('replaces every disallowed character rather than stripping (avoids collisions)', () => {
    expect(buildAudioKey('user-1', 'tx-1', '???')).toBe('audio/user-1/tx-1/___');
  });

  it('falls back to a default name when the filename is empty', () => {
    expect(buildAudioKey('user-1', 'tx-1', '')).toBe('audio/user-1/tx-1/audio');
  });

  it('builds the transcript text key convention {userId}/{transcriptionId}.txt', () => {
    expect(buildTranscriptTextKey('user-1', 'tx-1')).toBe('user-1/tx-1.txt');
  });

  it('builds the transcript json key convention {userId}/{transcriptionId}.json', () => {
    expect(buildTranscriptJsonKey('user-1', 'tx-1')).toBe('user-1/tx-1.json');
  });

  it('builds the partition key convention USER#{userId}', () => {
    expect(buildPartitionKey('user-1')).toBe('USER#user-1');
  });

  it('builds the sort key convention TRANSCRIPTION#{createdAt}#{transcriptionId}', () => {
    expect(buildSortKey('2026-08-15T10:00:00.000Z', 'tx-1')).toBe('TRANSCRIPTION#2026-08-15T10:00:00.000Z#tx-1');
  });
});

describe('domain/transcription — extractIdsFromAudioKey', () => {
  it('parses userId and transcriptionId out of a well-formed key', () => {
    expect(extractIdsFromAudioKey('audio/user-1/tx-1/song.mp3')).toEqual({ userId: 'user-1', transcriptionId: 'tx-1' });
  });

  it('returns null for a key missing the audio/ prefix', () => {
    expect(extractIdsFromAudioKey('user-1/tx-1/song.mp3')).toBeNull();
  });

  it('returns null for a key with too few path segments', () => {
    expect(extractIdsFromAudioKey('audio/user-1/song.mp3')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractIdsFromAudioKey('')).toBeNull();
  });
});

describe('domain/transcription — generateTranscriptionId', () => {
  it('generates a well-formed UUID v4', () => {
    const id = generateTranscriptionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates distinct ids on successive calls', () => {
    expect(generateTranscriptionId()).not.toBe(generateTranscriptionId());
  });
});

describe('domain/transcription — status transitions', () => {
  it.each([
    ['PENDING_UPLOAD', 'PROCESSING', true],
    ['PENDING_UPLOAD', 'FAILED', true],
    ['PENDING_UPLOAD', 'COMPLETED', false],
    ['PROCESSING', 'COMPLETED', true],
    ['PROCESSING', 'FAILED', true],
    ['PROCESSING', 'PENDING_UPLOAD', false],
    ['COMPLETED', 'PROCESSING', false],
    ['FAILED', 'PROCESSING', false],
  ] as const)('canTransition(%s, %s) === %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });

  it('treats COMPLETED and FAILED as terminal', () => {
    expect(isTerminalStatus('COMPLETED')).toBe(true);
    expect(isTerminalStatus('FAILED')).toBe(true);
  });

  it('treats PENDING_UPLOAD and PROCESSING as non-terminal', () => {
    expect(isTerminalStatus('PENDING_UPLOAD')).toBe(false);
    expect(isTerminalStatus('PROCESSING')).toBe(false);
  });
});

describe('domain/transcription — factory helpers', () => {
  it('createFileTranscription builds a PENDING_UPLOAD FILE record', () => {
    const now = '2026-08-15T10:00:00.000Z';
    const transcription = createFileTranscription({
      transcriptionId: 'tx-1',
      userId: 'user-1',
      sourceFileName: 'song.mp3',
      audioS3Key: 'audio/user-1/tx-1/song.mp3',
      now,
    });

    expect(transcription).toEqual({
      transcriptionId: 'tx-1',
      userId: 'user-1',
      type: 'FILE',
      status: 'PENDING_UPLOAD',
      sourceFileName: 'song.mp3',
      audioS3Key: 'audio/user-1/tx-1/song.mp3',
      createdAt: now,
      updatedAt: now,
    });
  });

  it('createRealtimeTranscription builds an already-COMPLETED REALTIME record', () => {
    const now = '2026-08-15T10:00:00.000Z';
    const transcription = createRealtimeTranscription({
      transcriptionId: 'tx-2',
      userId: 'user-1',
      transcriptS3Key: 'user-1/tx-2.txt',
      now,
      durationSeconds: 42,
      language: 'en',
    });

    expect(transcription.type).toBe('REALTIME');
    expect(transcription.status).toBe('COMPLETED');
    expect(transcription.transcriptS3Key).toBe('user-1/tx-2.txt');
    expect(transcription.durationSeconds).toBe(42);
    expect(transcription.language).toBe('en');
  });
});
