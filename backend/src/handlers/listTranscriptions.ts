/**
 * GET /transcriptions?cursor=&limit= (Cognito-authenticated)
 *
 * Queries the caller's transcriptions newest-first, 10 per page by default,
 * using an opaque base64 cursor for DynamoDB-idiomatic pagination.
 */
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { decodeCursor, encodeCursor } from '../domain/pagination';
import { queryTranscriptionsByUser } from '../infra/dynamo';
import { errorToResponse } from '../shared/errors';
import { getCallerClaims, ok, parseQuery } from '../shared/http';
import { errorMessage, logger } from '../shared/logger';
import { listTranscriptionsQuerySchema } from '../shared/schemas';
import { DEFAULT_PAGE_SIZE, ListTranscriptionsResponseBody } from '../shared/types';

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const caller = getCallerClaims(event);
    const query = parseQuery(event, listTranscriptionsQuerySchema);

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const exclusiveStartKey = query.cursor ? decodeCursor(query.cursor) : undefined;

    const page = await queryTranscriptionsByUser(caller.sub, limit, exclusiveStartKey);

    const response: ListTranscriptionsResponseBody = {
      items: page.items,
      nextCursor: page.lastEvaluatedKey ? encodeCursor(page.lastEvaluatedKey) : null,
    };
    return ok(response);
  } catch (error) {
    logger.error('listTranscriptions failed', { error: errorMessage(error) });
    return errorToResponse(error);
  }
}
