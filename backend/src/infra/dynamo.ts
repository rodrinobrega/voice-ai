/**
 * DynamoDB adapter — the only file that imports `@aws-sdk/client-dynamodb` /
 * `@aws-sdk/lib-dynamodb`. Handlers call these functions and never touch the
 * SDK or raw item shapes directly.
 *
 * Table design (single table, see docs/CONTRACTS.md):
 *   PK       = USER#{userId}
 *   SK       = TRANSCRIPTION#{createdAtISO}#{transcriptionId}
 *   GSI1PK   = {transcriptionId}   (GSI "GSI1", used to look up a single item
 *                                   by id alone, e.g. from an S3 event or a
 *                                   webhook callback where we don't know the
 *                                   SK's createdAt component)
 *
 * The `GSI1` index is an addition beyond the literal attribute list in
 * CONTRACTS.md: several handlers (`getTranscription`, `getDownloadUrl`,
 * `processUploadedAudio`, `speechmaticsWebhook`, `checkStuckTranscriptions`)
 * need to fetch/update a single item knowing only its `transcriptionId`, and
 * the primary key alone can't support that without either an extra GSI or an
 * expensive scan. This is called out in the final summary as a deliberate
 * deviation from the doc's literal schema.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { TranscriptionKey } from '../domain/pagination';
import { buildPartitionKey, buildSortKey, canTransition } from '../domain/transcription';
import { requireEnv } from '../shared/env';
import { NotFoundError } from '../shared/errors';
import { logger } from '../shared/logger';
import { Transcription, TranscriptionStatus, TranscriptionStatusPatch, TranscriptionType } from '../shared/types';

const GSI1_INDEX_NAME = 'GSI1';
const SORT_KEY_PREFIX = 'TRANSCRIPTION#';
const STATUS_PROCESSING: TranscriptionStatus = 'PROCESSING';

const VALID_TRANSCRIPTION_TYPES: readonly TranscriptionType[] = ['FILE', 'REALTIME'];
const VALID_TRANSCRIPTION_STATUSES: readonly TranscriptionStatus[] = ['PENDING_UPLOAD', 'PROCESSING', 'COMPLETED', 'FAILED'];

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function tableName(): string {
  return requireEnv('DYNAMODB_TABLE');
}

type DynamoItem = Record<string, unknown>;

function toItem(transcription: Transcription): DynamoItem {
  return {
    PK: buildPartitionKey(transcription.userId),
    SK: buildSortKey(transcription.createdAt, transcription.transcriptionId),
    GSI1PK: transcription.transcriptionId,
    ...transcription,
  };
}

function requireString(item: DynamoItem, key: string): string {
  const value = item[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`DynamoDB item missing required string field "${key}"`);
  }
  return value;
}

function optionalString(item: DynamoItem, key: string): string | undefined {
  const value = item[key];
  return typeof value === 'string' ? value : undefined;
}

function optionalNumber(item: DynamoItem, key: string): number | undefined {
  const value = item[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Reads a string field and validates it's one of `allowed`, rather than
 * blindly asserting the type with `as`. Guards against a hand-edited or
 * otherwise corrupted item silently propagating an invalid `type`/`status`
 * value through the system as if it were a valid enum member.
 */
function requireEnum<T extends string>(item: DynamoItem, key: string, allowed: readonly T[]): T {
  const value = requireString(item, key);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`DynamoDB item has invalid value for field "${key}": "${value}"`);
  }
  return value as T;
}

function fromItem(item: DynamoItem): Transcription {
  return {
    transcriptionId: requireString(item, 'transcriptionId'),
    userId: requireString(item, 'userId'),
    type: requireEnum(item, 'type', VALID_TRANSCRIPTION_TYPES),
    status: requireEnum(item, 'status', VALID_TRANSCRIPTION_STATUSES),
    sourceFileName: optionalString(item, 'sourceFileName'),
    audioS3Key: optionalString(item, 'audioS3Key'),
    transcriptS3Key: optionalString(item, 'transcriptS3Key'),
    language: optionalString(item, 'language'),
    durationSeconds: optionalNumber(item, 'durationSeconds'),
    speechmaticsJobId: optionalString(item, 'speechmaticsJobId'),
    errorMessage: optionalString(item, 'errorMessage'),
    createdAt: requireString(item, 'createdAt'),
    updatedAt: requireString(item, 'updatedAt'),
  };
}

export async function putTranscription(transcription: Transcription): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: tableName(),
      Item: toItem(transcription),
    }),
  );
}

interface PrimaryKeyLookup {
  key: TranscriptionKey;
  item: DynamoItem;
}

/** Resolves the table's primary key (PK/SK) for a transcription, given only its id, via GSI1. */
async function findPrimaryKeyByTranscriptionId(transcriptionId: string): Promise<PrimaryKeyLookup | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: GSI1_INDEX_NAME,
      KeyConditionExpression: 'GSI1PK = :id',
      ExpressionAttributeValues: { ':id': transcriptionId },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0];
  if (!item) {
    return null;
  }
  return { key: { PK: requireString(item, 'PK'), SK: requireString(item, 'SK') }, item };
}

export async function getTranscriptionById(transcriptionId: string): Promise<Transcription | null> {
  const lookup = await findPrimaryKeyByTranscriptionId(transcriptionId);
  return lookup ? fromItem(lookup.item) : null;
}

interface UpdateExpressionParts {
  setClauses: string[];
  names: Record<string, string>;
  values: Record<string, unknown>;
}

function buildUpdateExpression(patch: TranscriptionStatusPatch, now: string): UpdateExpressionParts {
  const parts: UpdateExpressionParts = {
    setClauses: ['#status = :status', '#updatedAt = :updatedAt'],
    names: { '#status': 'status', '#updatedAt': 'updatedAt' },
    values: { ':status': patch.status, ':updatedAt': now },
  };

  const optionalFields: Array<[keyof TranscriptionStatusPatch, string]> = [
    ['speechmaticsJobId', 'speechmaticsJobId'],
    ['transcriptS3Key', 'transcriptS3Key'],
    ['errorMessage', 'errorMessage'],
    ['language', 'language'],
    ['durationSeconds', 'durationSeconds'],
  ];

  for (const [patchKey, attributeName] of optionalFields) {
    const value = patch[patchKey];
    if (value !== undefined) {
      const nameToken = `#${attributeName}`;
      const valueToken = `:${attributeName}`;
      parts.setClauses.push(`${nameToken} = ${valueToken}`);
      parts.names[nameToken] = attributeName;
      parts.values[valueToken] = value;
    }
  }

  return parts;
}

export async function updateTranscriptionStatus(transcriptionId: string, patch: TranscriptionStatusPatch): Promise<void> {
  const lookup = await findPrimaryKeyByTranscriptionId(transcriptionId);
  if (!lookup) {
    throw new NotFoundError(`Transcription ${transcriptionId} not found`);
  }

  const currentStatus = requireEnum(lookup.item, 'status', VALID_TRANSCRIPTION_STATUSES);
  if (currentStatus !== patch.status && !canTransition(currentStatus, patch.status)) {
    // Idempotent no-op rather than an error: this guards against duplicate/
    // out-of-order Speechmatics webhook deliveries and against the
    // stuck-transcription reconciliation job racing a webhook that already
    // completed the same job (e.g. COMPLETED -> PROCESSING, or a second
    // COMPLETED -> COMPLETED delivery attempting to re-write already-final
    // data). Silently accepting would corrupt state; throwing would turn a
    // harmless retry into a 5xx and an unnecessary alarm, so we log and skip.
    logger.warn('Ignoring illegal transcription status transition', {
      transcriptionId,
      from: currentStatus,
      to: patch.status,
    });
    return;
  }

  const now = new Date().toISOString();
  const { setClauses, names, values } = buildUpdateExpression(patch, now);

  await docClient.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: lookup.key,
      UpdateExpression: `SET ${setClauses.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

export interface QueryPageResult {
  items: Transcription[];
  lastEvaluatedKey?: TranscriptionKey;
}

/**
 * Narrows a raw `LastEvaluatedKey` (typed loosely by the SDK as
 * `Record<string, NativeAttributeValue> | undefined`) down to our own
 * `TranscriptionKey` shape, in one place, instead of an inline double-cast
 * at the call site.
 */
function toTranscriptionKey(rawKey: Record<string, unknown> | undefined): TranscriptionKey | undefined {
  if (!rawKey || typeof rawKey.PK !== 'string' || typeof rawKey.SK !== 'string') {
    return undefined;
  }
  return { PK: rawKey.PK, SK: rawKey.SK };
}

export async function queryTranscriptionsByUser(
  userId: string,
  limit: number,
  exclusiveStartKey?: TranscriptionKey,
): Promise<QueryPageResult> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: { ':pk': buildPartitionKey(userId), ':skPrefix': SORT_KEY_PREFIX },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const items = (result.Items ?? []).map((item) => fromItem(item));
  return { items, lastEvaluatedKey: toTranscriptionKey(result.LastEvaluatedKey) };
}

/**
 * Finds `PROCESSING` items whose `updatedAt` is older than `olderThanIso`.
 *
 * Implemented as a table `Scan` with a filter, which is fine at this
 * exercise's scale (a handful of concurrently-processing jobs). Production
 * use at scale should add a GSI on `status` (+`updatedAt` as sort key) to
 * make this a `Query` instead — noted in ARCHITECTURE.md §5 as an additive,
 * non-breaking future change.
 */
export async function queryStuckProcessing(olderThanIso: string): Promise<Transcription[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: tableName(),
      FilterExpression: '#status = :status AND #updatedAt < :threshold',
      ExpressionAttributeNames: { '#status': 'status', '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':status': STATUS_PROCESSING, ':threshold': olderThanIso },
    }),
  );
  return (result.Items ?? []).map((item) => fromItem(item));
}
