import { assertOwnership, isOwner } from '../../src/domain/ownership';
import { ForbiddenError } from '../../src/shared/errors';

describe('domain/ownership', () => {
  describe('isOwner', () => {
    it('returns true when the resource userId matches the caller userId', () => {
      expect(isOwner('user-1', 'user-1')).toBe(true);
    });

    it('returns false when the resource userId does not match the caller userId', () => {
      expect(isOwner('user-1', 'user-2')).toBe(false);
    });

    it('is case-sensitive (Cognito subs are opaque UUID-like strings, not case-normalized)', () => {
      expect(isOwner('User-1', 'user-1')).toBe(false);
    });
  });

  describe('assertOwnership', () => {
    it('does not throw when the caller owns the resource', () => {
      expect(() => assertOwnership('user-1', 'user-1')).not.toThrow();
    });

    it('throws ForbiddenError when the caller does not own the resource', () => {
      expect(() => assertOwnership('user-1', 'user-2')).toThrow(ForbiddenError);
    });

    it('throws ForbiddenError (not some other error) with a 403 status code', () => {
      expect.assertions(2);
      try {
        assertOwnership('owner-abc', 'attacker-xyz');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenError);
        expect((error as ForbiddenError).statusCode).toBe(403);
      }
    });
  });
});
