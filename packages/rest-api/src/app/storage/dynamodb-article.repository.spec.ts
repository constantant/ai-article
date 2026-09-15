import {
  DynamoDBClient,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { Article } from '@org/schema';
import { ARTICLE_SCHEMA_VERSION } from '@org/schema';
import { SlugConflictError } from './article-repository.port.js';
import { DynamoArticleRepository } from './dynamodb-article.repository.js';

const documentClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
);
const ddbMock = mockClient(documentClient);

const config = { appsTable: 'test-apps', articlesTable: 'test-articles' };

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    appId: 'tech-blog',
    slug: 'hello',
    title: 'Hello',
    status: 'draft',
    schemaVersion: ARTICLE_SCHEMA_VERSION,
    blocks: [{ type: 'heading', level: 1, text: 'Hello' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('DynamoArticleRepository', () => {
  let repo: DynamoArticleRepository;

  beforeEach(() => {
    ddbMock.reset();
    repo = new DynamoArticleRepository(documentClient, config);
  });

  describe('create', () => {
    it('writes the article and a slug pointer in one transaction', async () => {
      ddbMock.on(TransactWriteCommand).resolves({});

      await repo.create(article());

      const call = ddbMock.commandCalls(TransactWriteCommand)[0];
      const items = call.args[0].input.TransactItems ?? [];
      expect(items).toHaveLength(2);
      expect(items[0].Put?.Item).toMatchObject({
        appId: 'tech-blog',
        sk: 'ARTICLE#a1',
        slug: 'hello',
      });
      expect(items[1].Put?.Item).toMatchObject({
        appId: 'tech-blog',
        sk: 'SLUG#hello',
        articleId: 'a1',
      });
    });

    it('maps a cancelled transaction to SlugConflictError', async () => {
      ddbMock.on(TransactWriteCommand).rejects(
        new TransactionCanceledException({
          message: 'cancelled',
          $metadata: {},
          CancellationReasons: [],
        }),
      );

      await expect(repo.create(article())).rejects.toThrow(SlugConflictError);
    });
  });

  describe('update', () => {
    it('does a plain overwrite when the slug is unchanged', async () => {
      ddbMock
        .on(GetCommand)
        .resolves({ Item: { ...article(), sk: 'ARTICLE#a1' } });
      ddbMock.on(PutCommand).resolves({});

      await repo.update(article({ title: 'Updated' }));

      expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
      expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
    });

    it('moves the slug pointer transactionally when the slug changes', async () => {
      ddbMock
        .on(GetCommand)
        .resolves({ Item: { ...article(), sk: 'ARTICLE#a1' } });
      ddbMock.on(TransactWriteCommand).resolves({});

      await repo.update(article({ slug: 'new-slug' }));

      const call = ddbMock.commandCalls(TransactWriteCommand)[0];
      const items = call.args[0].input.TransactItems ?? [];
      expect(items[0].Delete?.Key).toEqual({
        appId: 'tech-blog',
        sk: 'SLUG#hello',
      });
      expect(items[1].Put?.Item).toMatchObject({
        sk: 'SLUG#new-slug',
        articleId: 'a1',
      });
      expect(items[2].Put?.Item).toMatchObject({
        sk: 'ARTICLE#a1',
        slug: 'new-slug',
      });
    });
  });

  describe('findBySlug', () => {
    it('returns null when no pointer exists', async () => {
      ddbMock.on(GetCommand).resolves({});

      expect(await repo.findBySlug('tech-blog', 'missing')).toBeNull();
    });

    it('resolves the pointer then fetches the article', async () => {
      ddbMock
        .on(GetCommand, {
          TableName: 'test-articles',
          Key: { appId: 'tech-blog', sk: 'SLUG#hello' },
        })
        .resolves({
          Item: { appId: 'tech-blog', sk: 'SLUG#hello', articleId: 'a1' },
        })
        .on(GetCommand, {
          TableName: 'test-articles',
          Key: { appId: 'tech-blog', sk: 'ARTICLE#a1' },
        })
        .resolves({ Item: { ...article(), sk: 'ARTICLE#a1' } });

      const result = await repo.findBySlug('tech-blog', 'hello');

      expect(result?.id).toBe('a1');
    });
  });

  describe('list', () => {
    it('queries by appId with the ARTICLE# prefix and applies the status filter', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { ...article({ status: 'draft' }), sk: 'ARTICLE#a1' },
          { ...article({ id: 'a2', status: 'published' }), sk: 'ARTICLE#a2' },
        ],
      });

      const published = await repo.list('tech-blog', { status: 'published' });

      expect(published).toHaveLength(1);
      expect(published[0].id).toBe('a2');
    });
  });
});
