import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  type QueryCommandInput,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from './env.js';

let cached: DynamoDBDocumentClient | undefined;

/** Lazily built so unit tests can run without AWS configuration present. */
export function docClient(): DynamoDBDocumentClient {
  if (!cached) {
    const base = new DynamoDBClient({
      region: env.region,
      ...(env.dynamoEndpoint ? { endpoint: env.dynamoEndpoint } : {}),
    });
    cached = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return cached;
}

export const TABLE = () => env.tableName;

const INTERNAL_ATTRIBUTES = new Set([
  'PK',
  'SK',
  'entityType',
  'gsi1pk',
  'gsi1sk',
  'gsi2pk',
  'gsi2sk',
  'gsi3pk',
  'gsi3sk',
]);

/**
 * Drops the single-table plumbing before an item leaves the data layer. The key
 * shapes are an internal storage decision, and echoing them in API responses
 * would make them a contract we could not change later.
 */
export function toEntity<T>(item: Record<string, any>): T {
  const entity: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (!INTERNAL_ATTRIBUTES.has(key)) entity[key] = value;
  }
  return entity as T;
}

/**
 * Follows LastEvaluatedKey until the page limit is met. Branch-scale datasets
 * are small, but filtered queries can still return sparse pages, and a single
 * Query call would silently under-report.
 */
export async function queryAll<T>(input: QueryCommandInput, limit = 2000): Promise<T[]> {
  const client = docClient();
  const items: T[] = [];
  let cursor: Record<string, any> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({ ...input, ExclusiveStartKey: cursor }),
    );
    items.push(...(result.Items ?? []).map((item) => toEntity<T>(item)));
    cursor = result.LastEvaluatedKey;
  } while (cursor && items.length < limit);

  return items.slice(0, limit);
}
