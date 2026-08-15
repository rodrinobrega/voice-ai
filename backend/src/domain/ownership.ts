/**
 * Ownership checks. Every read of a user-owned resource must go through
 * here rather than re-implementing the `===` comparison inline, both to
 * keep the rule unit-tested in one place and to make it impossible to
 * accidentally trust a client-supplied user id instead of the verified
 * Cognito `sub` claim.
 */
import { ForbiddenError } from '../shared/errors';

/** Returns true if the caller owns the resource. */
export function isOwner(resourceUserId: string, callerUserId: string): boolean {
  return resourceUserId === callerUserId;
}

/** Throws `ForbiddenError` if the caller does not own the resource. */
export function assertOwnership(resourceUserId: string, callerUserId: string): void {
  if (!isOwner(resourceUserId, callerUserId)) {
    throw new ForbiddenError('You do not have access to this resource');
  }
}
