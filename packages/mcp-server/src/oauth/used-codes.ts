import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

/**
 * A pure JWT authorization code has no replay protection on its own — OAuth
 * 2.1 requires codes be single-use, and concurrent Lambda containers share
 * no memory, so this is one small piece of real state the stateless-JWT
 * design still needs: a write-once flag per code `jti`, not a code/token
 * content store.
 */
export interface UsedCodeGuard {
  /** Returns true the first time this jti is claimed, false on any replay. */
  claim(jti: string, ttlSeconds: number): Promise<boolean>;
}

export class InMemoryUsedCodeGuard implements UsedCodeGuard {
  private readonly claimed = new Map<string, number>();

  async claim(jti: string, ttlSeconds: number): Promise<boolean> {
    this.sweep();
    if (this.claimed.has(jti)) {
      return false;
    }
    this.claimed.set(jti, Date.now() + ttlSeconds * 1000);
    return true;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [jti, expiresAt] of this.claimed) {
      if (expiresAt <= now) {
        this.claimed.delete(jti);
      }
    }
  }
}

export class DynamoDbUsedCodeGuard implements UsedCodeGuard {
  private readonly client: DynamoDBDocumentClient;

  constructor(
    private readonly tableName: string,
    endpoint = process.env['DYNAMODB_ENDPOINT'],
  ) {
    this.client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ endpoint }),
    );
  }

  async claim(jti: string, ttlSeconds: number): Promise<boolean> {
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            jti,
            expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
          },
          ConditionExpression: 'attribute_not_exists(jti)',
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }
}
