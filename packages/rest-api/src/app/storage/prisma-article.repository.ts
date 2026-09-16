import { Injectable } from '@nestjs/common';
import type { Article, ArticleMeta, ArticleStatus, Block } from '@org/schema';
import { Prisma } from '../../generated/prisma/client.js';
import type { Article as ArticleRow } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ArticleRepository,
  SlugConflictError,
} from './article-repository.port.js';

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    appId: row.appId,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    status: row.status as ArticleStatus,
    schemaVersion: row.schemaVersion as 1,
    meta: (row.meta as ArticleMeta | null) ?? undefined,
    blocks: row.blocks as Block[],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toData(article: Article) {
  return {
    id: article.id,
    appId: article.appId,
    slug: article.slug,
    title: article.title,
    summary: article.summary ?? null,
    status: article.status,
    schemaVersion: article.schemaVersion,
    meta: (article.meta ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    blocks: article.blocks as unknown as Prisma.InputJsonValue,
  };
}

@Injectable()
export class PrismaArticleRepository implements ArticleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(article: Article): Promise<Article> {
    try {
      const row = await this.prisma.article.create({ data: toData(article) });
      return toArticle(row);
    } catch (error) {
      throw this.mapConflict(error, article.appId, article.slug);
    }
  }

  async update(article: Article): Promise<Article> {
    try {
      const row = await this.prisma.article.update({
        where: { id: article.id },
        data: toData(article),
      });
      return toArticle(row);
    } catch (error) {
      throw this.mapConflict(error, article.appId, article.slug);
    }
  }

  async findById(appId: string, id: string): Promise<Article | null> {
    const row = await this.prisma.article.findFirst({ where: { id, appId } });
    return row ? toArticle(row) : null;
  }

  async findBySlug(appId: string, slug: string): Promise<Article | null> {
    const row = await this.prisma.article.findUnique({
      where: { appId_slug: { appId, slug } },
    });
    return row ? toArticle(row) : null;
  }

  async list(
    appId: string,
    filter?: { status?: ArticleStatus },
  ): Promise<Article[]> {
    const rows = await this.prisma.article.findMany({
      where: { appId, ...(filter?.status ? { status: filter.status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toArticle);
  }

  async deleteAllForApp(appId: string): Promise<void> {
    await this.prisma.article.deleteMany({ where: { appId } });
  }

  private mapConflict(error: unknown, appId: string, slug: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new SlugConflictError(appId, slug);
    }
    return error;
  }
}
