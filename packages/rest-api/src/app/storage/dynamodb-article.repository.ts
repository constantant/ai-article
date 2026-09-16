import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Inject, Injectable } from '@nestjs/common';
import type { Article, ArticleMeta, ArticleStatus, Block } from '@org/schema';
import type { DynamoDbConfig } from './dynamodb-config.js';
import { SlugConflictError } from './article-repository.port.js';
import type { ArticleRepository } from './article-repository.port.js';
import { DYNAMODB_CONFIG, DYNAMODB_DOCUMENT_CLIENT } from './tokens.js';

/**
 * Single table, two item shapes sharing PK `appId`:
 *  - SK `ARTICLE#<id>`   — the article itself
 *  - SK `SLUG#<slug>`    — a thin pointer `{ articleId }`, used only to
 *    enforce "slug unique per app" (via a conditional write) and to resolve
 *    slug -> id for the public by-slug lookup.
 */
const articleSk = (id: string) => `ARTICLE#${id}`;
const slugSk = (slug: string) => `SLUG#${slug}`;
const ARTICLE_SK_PREFIX = 'ARTICLE#';

interface ArticleItem {
  appId: string;
  sk: string;
  id: string;
  slug: string;
  title: string;
  summary?: string;
  status: ArticleStatus;
  schemaVersion: 1;
  meta?: ArticleMeta;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
}

interface SlugPointerItem {
  appId: string;
  sk: string;
  articleId: string;
}

function toArticle(item: ArticleItem): Article {
  return {
    id: item.id,
    appId: item.appId,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    status: item.status,
    schemaVersion: item.schemaVersion,
    meta: item.meta,
    blocks: item.blocks,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toItem(article: Article): ArticleItem {
  return {
    appId: article.appId,
    sk: articleSk(article.id),
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    status: article.status,
    schemaVersion: article.schemaVersion,
    meta: article.meta,
    blocks: article.blocks,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  };
}

@Injectable()
export class DynamoArticleRepository implements ArticleRepository {
  constructor(
    @Inject(DYNAMODB_DOCUMENT_CLIENT)
    private readonly client: DynamoDBDocumentClient,
    @Inject(DYNAMODB_CONFIG) private readonly config: DynamoDbConfig,
  ) {}

  async create(article: Article): Promise<Article> {
    const pointer: SlugPointerItem = {
      appId: article.appId,
      sk: slugSk(article.slug),
      articleId: article.id,
    };
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.config.articlesTable,
                Item: toItem(article),
                ConditionExpression: 'attribute_not_exists(sk)',
              },
            },
            {
              Put: {
                TableName: this.config.articlesTable,
                Item: pointer,
                ConditionExpression: 'attribute_not_exists(sk)',
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        throw new SlugConflictError(article.appId, article.slug);
      }
      throw error;
    }
    return article;
  }

  async update(article: Article): Promise<Article> {
    const existing = await this.findById(article.appId, article.id);

    if (!existing || existing.slug === article.slug) {
      await this.client.send(
        new PutCommand({
          TableName: this.config.articlesTable,
          Item: toItem(article),
        }),
      );
      return article;
    }

    // Slug changed: move the uniqueness pointer atomically with the update.
    const pointer: SlugPointerItem = {
      appId: article.appId,
      sk: slugSk(article.slug),
      articleId: article.id,
    };
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: this.config.articlesTable,
                Key: { appId: article.appId, sk: slugSk(existing.slug) },
              },
            },
            {
              Put: {
                TableName: this.config.articlesTable,
                Item: pointer,
                ConditionExpression: 'attribute_not_exists(sk)',
              },
            },
            {
              Put: {
                TableName: this.config.articlesTable,
                Item: toItem(article),
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (error instanceof TransactionCanceledException) {
        throw new SlugConflictError(article.appId, article.slug);
      }
      throw error;
    }
    return article;
  }

  async findById(appId: string, id: string): Promise<Article | null> {
    const res = await this.client.send(
      new GetCommand({
        TableName: this.config.articlesTable,
        Key: { appId, sk: articleSk(id) },
      }),
    );
    return res.Item ? toArticle(res.Item as ArticleItem) : null;
  }

  async findBySlug(appId: string, slug: string): Promise<Article | null> {
    const pointerRes = await this.client.send(
      new GetCommand({
        TableName: this.config.articlesTable,
        Key: { appId, sk: slugSk(slug) },
      }),
    );
    const pointer = pointerRes.Item as SlugPointerItem | undefined;
    return pointer ? this.findById(appId, pointer.articleId) : null;
  }

  async list(
    appId: string,
    filter?: { status?: ArticleStatus },
  ): Promise<Article[]> {
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.config.articlesTable,
        KeyConditionExpression: 'appId = :appId AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':appId': appId,
          ':prefix': ARTICLE_SK_PREFIX,
        },
      }),
    );
    const articles = (res.Items ?? []).map((item) =>
      toArticle(item as ArticleItem),
    );
    return filter?.status
      ? articles.filter((article) => article.status === filter.status)
      : articles;
  }

  /** Deletes every item under this app's partition — articles and slug pointers alike. */
  async deleteAllForApp(appId: string): Promise<void> {
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.config.articlesTable,
        KeyConditionExpression: 'appId = :appId',
        ExpressionAttributeValues: { ':appId': appId },
      }),
    );
    await Promise.all(
      (res.Items ?? []).map((item) =>
        this.client.send(
          new DeleteCommand({
            TableName: this.config.articlesTable,
            Key: { appId, sk: (item as { sk: string }).sk },
          }),
        ),
      ),
    );
  }
}
