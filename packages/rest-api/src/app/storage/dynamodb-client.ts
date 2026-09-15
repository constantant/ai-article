import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * DYNAMODB_ENDPOINT is only ever set for local testing against DynamoDB Local
 * — in Lambda, region/credentials resolve from the execution environment as
 * usual, no config needed.
 */
export function createDynamoDbDocumentClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    endpoint: process.env['DYNAMODB_ENDPOINT'],
  });
  return DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
}
