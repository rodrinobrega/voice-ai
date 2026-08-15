import { decodeCursor, encodeCursor, TranscriptionKey } from '../../src/domain/pagination';
import { ValidationError } from '../../src/shared/errors';

describe('domain/pagination', () => {
  describe('encodeCursor / decodeCursor round trip', () => {
    it('decodes exactly what was encoded', () => {
      const key: TranscriptionKey = { PK: 'USER#abc-123', SK: 'TRANSCRIPTION#2026-08-15T10:00:00.000Z#tx-1' };

      const cursor = encodeCursor(key);
      const decoded = decodeCursor(cursor);

      expect(decoded).toEqual(key);
    });

    it('produces a URL-safe opaque string (no +, /, or = characters)', () => {
      const key: TranscriptionKey = { PK: 'USER#abc', SK: 'TRANSCRIPTION#2026-08-15T10:00:00.000Z#tx-1' };

      const cursor = encodeCursor(key);

      expect(cursor).not.toMatch(/[+/=]/);
    });

    it('round-trips keys containing special characters', () => {
      const key: TranscriptionKey = { PK: 'USER#a+b/c=d', SK: 'TRANSCRIPTION#2026-08-15T10:00:00.000Z#tx-é-1' };

      expect(decodeCursor(encodeCursor(key))).toEqual(key);
    });
  });

  describe('decodeCursor invalid input handling', () => {
    it('throws ValidationError for a non-base64url string that decodes to invalid JSON', () => {
      expect(() => decodeCursor('not-valid-json-at-all-!!!')).toThrow(ValidationError);
    });

    it('throws ValidationError when the decoded JSON is missing SK', () => {
      const malformed = Buffer.from(JSON.stringify({ PK: 'USER#abc' }), 'utf-8').toString('base64url');

      expect(() => decodeCursor(malformed)).toThrow(ValidationError);
    });

    it('throws ValidationError when the decoded JSON is missing PK', () => {
      const malformed = Buffer.from(JSON.stringify({ SK: 'TRANSCRIPTION#x' }), 'utf-8').toString('base64url');

      expect(() => decodeCursor(malformed)).toThrow(ValidationError);
    });

    it('throws ValidationError when the decoded JSON is an array, not an object', () => {
      const malformed = Buffer.from(JSON.stringify(['PK', 'SK']), 'utf-8').toString('base64url');

      expect(() => decodeCursor(malformed)).toThrow(ValidationError);
    });

    it('throws ValidationError when the decoded JSON has non-string PK/SK', () => {
      const malformed = Buffer.from(JSON.stringify({ PK: 1, SK: 2 }), 'utf-8').toString('base64url');

      expect(() => decodeCursor(malformed)).toThrow(ValidationError);
    });

    it('throws ValidationError for an empty string', () => {
      expect(() => decodeCursor('')).toThrow(ValidationError);
    });
  });
});
