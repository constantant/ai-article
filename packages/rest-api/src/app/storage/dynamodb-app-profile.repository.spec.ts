import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { AppProfile } from '@org/schema';
import { AppIdConflictError } from './app-profile-repository.port.js';
import { DynamoAppProfileRepository } from './dynamodb-app-profile.repository.js';

const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
);
const ddbMock = mockClient(documentClient);

const config = { appsTable: 'test-apps', articlesTable: 'test-articles' };

const profile: AppProfile = {
  appId: 'tech-blog',
  name: 'Tech Blog',
  voice: { tone: 'terse', audience: 'engineers', doNots: ['fluff'] },
  allowedBlockTypes: ['heading', 'paragraph'],
  designTokens: { 'color-surface': '#000' },
};

describe('DynamoAppProfileRepository', () => {
  let repo: DynamoAppProfileRepository;

  beforeEach(() => {
    ddbMock.reset();
    repo = new DynamoAppProfileRepository(documentClient, config);
  });

  it('creates an app with a conditional put keyed on appId', async () => {
    ddbMock.on(PutCommand).resolves({});

    await repo.create(profile, 'hashed-key');

    const call = ddbMock.commandCalls(PutCommand)[0];
    expect(call.args[0].input).toMatchObject({
      TableName: 'test-apps',
      ConditionExpression: 'attribute_not_exists(appId)',
      Item: expect.objectContaining({
        appId: 'tech-blog',
        apiKeyHash: 'hashed-key',
      }),
    });
  });

  it('maps a conditional check failure to AppIdConflictError', async () => {
    ddbMock.on(PutCommand).rejects(
      new ConditionalCheckFailedException({
        message: 'conflict',
        $metadata: {},
      }),
    );

    await expect(repo.create(profile, 'hashed-key')).rejects.toThrow(
      AppIdConflictError,
    );
  });

  it('findById returns null when the item is missing', async () => {
    ddbMock.on(GetCommand).resolves({});

    expect(await repo.findById('nope')).toBeNull();
  });

  it('findById reconstructs the profile and apiKeyHash from the item', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        appId: 'tech-blog',
        name: 'Tech Blog',
        voiceTone: 'terse',
        voiceAudience: 'engineers',
        voiceDoNots: ['fluff'],
        allowedBlockTypes: ['heading', 'paragraph'],
        designTokens: { 'color-surface': '#000' },
        apiKeyHash: 'hashed-key',
      },
    });

    const result = await repo.findById('tech-blog');

    expect(result).toEqual({ profile, apiKeyHash: 'hashed-key' });
  });

  it('list scans the table and maps every item to a profile', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          appId: 'tech-blog',
          name: 'Tech Blog',
          voiceTone: 'terse',
          voiceAudience: 'engineers',
          allowedBlockTypes: ['heading'],
          designTokens: {},
          apiKeyHash: 'x',
        },
      ],
    });

    const result = await repo.list();

    expect(result).toHaveLength(1);
    expect(result[0].appId).toBe('tech-blog');
  });
});
