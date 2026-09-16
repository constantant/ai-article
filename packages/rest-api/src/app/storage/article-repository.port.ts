import type { Article, ArticleStatus } from '@org/schema';

export class SlugConflictError extends Error {
  constructor(appId: string, slug: string) {
    super(`article with slug "${slug}" already exists for app "${appId}"`);
    this.name = 'SlugConflictError';
  }
}

export interface ArticleRepository {
  create(article: Article): Promise<Article>;
  update(article: Article): Promise<Article>;
  findById(appId: string, id: string): Promise<Article | null>;
  findBySlug(appId: string, slug: string): Promise<Article | null>;
  list(appId: string, filter?: { status?: ArticleStatus }): Promise<Article[]>;
  delete(appId: string, id: string): Promise<void>;
  deleteAllForApp(appId: string): Promise<void>;
}
