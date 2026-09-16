import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';
import type { AppProfile, BlockType } from '@org/schema';
import type { DynamoDbConfig } from './dynamodb-config.js';
import { AppIdConflictError } from './app-profile-repository.port.js';
import type {
  AppProfileRepository,
  StoredAppProfile,
} from './app-profile-repository.port.js';
import { DYNAMODB_CONFIG, DYNAMODB_DOCUMENT_CLIENT } from './tokens.js';

interface AppItem {
  appId: string;
  name: string;
  voiceTone: string;
  voiceAudience: string;
  voiceDoNots?: string[];
  allowedBlockTypes: BlockType[];
  contentConventions?: string;
  designTokens: Record<string, string>;
  exampleArticleIds?: string[];
  apiKeyHash: string;
}

function toProfile(item: AppItem): AppProfile {
  return {
    appId: item.appId,
    name: item.name,
    voice: {
      tone: item.voiceTone,
      audience: item.voiceAudience,
      doNots: item.voiceDoNots,
    },
    allowedBlockTypes: item.allowedBlockTypes,
    contentConventions: item.contentConventions,
    designTokens: item.designTokens,
    exampleArticleIds: item.exampleArticleIds,
  };
}

@Injectable()
export class DynamoAppProfileRepository implements AppProfileRepository {
  constructor(
    @Inject(DYNAMODB_DOCUMENT_CLIENT)
    private readonly client: DynamoDBDocumentClient,
    @Inject(DYNAMODB_CONFIG) private readonly config: DynamoDbConfig,
  ) {}

  async create(profile: AppProfile, apiKeyHash: string): Promise<void> {
    const item: AppItem = {
      appId: profile.appId,
      name: profile.name,
      voiceTone: profile.voice.tone,
      voiceAudience: profile.voice.audience,
      voiceDoNots: profile.voice.doNots,
      allowedBlockTypes: profile.allowedBlockTypes,
      contentConventions: profile.contentConventions,
      designTokens: profile.designTokens,
      exampleArticleIds: profile.exampleArticleIds,
      apiKeyHash,
    };
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.config.appsTable,
          Item: item,
          ConditionExpression: 'attribute_not_exists(appId)',
        }),
      );
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new AppIdConflictError(profile.appId);
      }
      throw error;
    }
  }

  async findById(appId: string): Promise<StoredAppProfile | null> {
    const res = await this.client.send(
      new GetCommand({ TableName: this.config.appsTable, Key: { appId } }),
    );
    if (!res.Item) {
      return null;
    }
    const item = res.Item as AppItem;
    return { profile: toProfile(item), apiKeyHash: item.apiKeyHash };
  }

  async list(): Promise<AppProfile[]> {
    const res = await this.client.send(
      new ScanCommand({ TableName: this.config.appsTable }),
    );
    return (res.Items ?? []).map((item) => toProfile(item as AppItem));
  }

  async deleteById(appId: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({ TableName: this.config.appsTable, Key: { appId } }),
    );
  }
}
