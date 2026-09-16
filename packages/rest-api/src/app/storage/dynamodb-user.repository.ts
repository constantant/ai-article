import { randomUUID } from 'node:crypto';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';
import type { DynamoDbConfig } from './dynamodb-config.js';
import { EmailConflictError } from './user-repository.port.js';
import type { StoredUser, UserRepository } from './user-repository.port.js';
import { DYNAMODB_CONFIG, DYNAMODB_DOCUMENT_CLIENT } from './tokens.js';

/**
 * Single table, three item shapes sharing the same (userId, sk) schema:
 *  - PK `<userId>`,       SK `PROFILE`        — { email, passwordHash }
 *  - PK `<userId>`,       SK `APPKEY#<appId>` — { apiKey }, one per linked app
 *  - PK `EMAIL#<email>`,  SK `POINTER`        — { userId }, a global-uniqueness
 *    + lookup pointer, exactly like the article repository's SLUG# pointer —
 *    except the pointer's own PK must be the unique field itself (email),
 *    not the owning entity's PK, because email uniqueness is global rather
 *    than scoped under an already-known partition (contrast with per-app
 *    slug uniqueness, which is scoped under `appId`).
 */
const PROFILE_SK = 'PROFILE';
const POINTER_SK = 'POINTER';
const appKeySk = (appId: string) => `APPKEY#${appId}`;
const APPKEY_SK_PREFIX = 'APPKEY#';
const emailPk = (email: string) => `EMAIL#${email}`;

interface ProfileItem {
  userId: string;
  sk: typeof PROFILE_SK;
  email: string;
  passwordHash: string;
}

interface EmailPointerItem {
  userId: string; // holds `EMAIL#<email>` for this item shape
  sk: typeof POINTER_SK;
  targetUserId: string;
}

interface AppKeyItem {
  userId: string;
  sk: string;
  apiKey: string;
}

@Injectable()
export class DynamoUserRepository implements UserRepository {
  constructor(
    @Inject(DYNAMODB_DOCUMENT_CLIENT)
    private readonly client: DynamoDBDocumentClient,
    @Inject(DYNAMODB_CONFIG) private readonly config: DynamoDbConfig,
  ) {}

  async create(email: string, passwordHash: string): Promise<StoredUser> {
    const id = randomUUID();
    const profile: ProfileItem = {
      userId: id,
      sk: PROFILE_SK,
      email,
      passwordHash,
    };
    const pointer: EmailPointerItem = {
      userId: emailPk(email),
      sk: POINTER_SK,
      targetUserId: id,
    };
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.usersTable,
                Item: profile,
                ConditionExpression: 'attribute_not_exists(sk)',
              },
            },
            {
              Put: {
                TableName: this.config.usersTable,
                Item: pointer,
                ConditionExpression: 'attribute_not_exists(sk)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        throw new EmailConflictError(email);
      }
      throw error;
    }
    return { id, email, passwordHash };
  }

  async findByEmail(email: string): Promise<StoredUser | null> {
    const pointerRes = await this.client.send(
      new GetCommand({
        TableName: this.config.usersTable,
        Key: { userId: emailPk(email), sk: POINTER_SK },
      }),
    );
    const pointer = pointerRes.Item as EmailPointerItem | undefined;
    return pointer ? this.findById(pointer.targetUserId) : null;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const res = await this.client.send(
      new GetCommand({
        TableName: this.config.usersTable,
        Key: { userId: id, sk: PROFILE_SK },
      }),
    );
    if (!res.Item) {
      return null;
    }
    const item = res.Item as ProfileItem;
    return {
      id: item.userId,
      email: item.email,
      passwordHash: item.passwordHash,
    };
  }

  async count(): Promise<number> {
    const res = await this.client.send(
      new ScanCommand({
        TableName: this.config.usersTable,
        FilterExpression: 'sk = :sk',
        ExpressionAttributeValues: { ':sk': PROFILE_SK },
        Select: 'COUNT',
      }),
    );
    return res.Count ?? 0;
  }

  async putAppKey(
    userId: string,
    appId: string,
    apiKey: string,
  ): Promise<void> {
    const item: AppKeyItem = { userId, sk: appKeySk(appId), apiKey };
    await this.client.send(
      new PutCommand({ TableName: this.config.usersTable, Item: item }),
    );
  }

  async deleteAppKey(userId: string, appId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.config.usersTable,
        Key: { userId, sk: appKeySk(appId) },
      }),
    );
  }

  async listAppKeys(userId: string): Promise<Record<string, string>> {
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.config.usersTable,
        KeyConditionExpression: 'userId = :userId AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':prefix': APPKEY_SK_PREFIX,
        },
      }),
    );
    const items = (res.Items ?? []) as AppKeyItem[];
    return Object.fromEntries(
      items.map((item) => [
        item.sk.slice(APPKEY_SK_PREFIX.length),
        item.apiKey,
      ]),
    );
  }
}
