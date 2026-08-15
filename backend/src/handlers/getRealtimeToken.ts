/**
 * POST /transcriptions/realtime-token (Cognito-authenticated)
 *
 * Mints a short-lived Speechmatics real-time API key server-side so the
 * permanent key never reaches the browser, and returns it alongside the
 * real-time WebSocket URL.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { mintRealtimeToken } from '../infra/speechmatics';
import { requireEnv } from '../shared/env';
import { errorToResponse } from '../shared/errors';
import { getCallerClaims, ok } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { RealtimeTokenResponseBody } from '../shared/types';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    getCallerClaims(event); // authentication is enforced here; the token itself isn't per-user scoped by Speechmatics
    const { token } = await mintRealtimeToken();
    const response: RealtimeTokenResponseBody = { token, url: requireEnv('SPEECHMATICS_RT_URL') };
    return ok(response);
  } catch (error) {
    logger.error('getRealtimeToken failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
