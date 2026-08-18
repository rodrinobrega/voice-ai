/**
 * GET /me (Cognito-authenticated)
 *
 * Trivial handler that echoes the caller's verified Cognito claims. Used as
 * a wiring smoke test for the JWT authorizer end to end.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { errorToResponse } from '../shared/errors';
import { getCallerClaims, ok } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { MeResponseBody } from '../shared/types';

// The Lambda handler contract is Promise-returning; this particular handler
// has nothing to await (it only reads claims off the event).
// eslint-disable-next-line @typescript-eslint/require-await
export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const caller = getCallerClaims(event);
    const response: MeResponseBody = { sub: caller.sub, email: caller.email };
    return ok(response);
  } catch (error) {
    logger.error('me failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
