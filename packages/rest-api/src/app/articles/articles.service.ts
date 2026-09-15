import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Article, ArticleDraftInput, ValidationError } from '@org/schema';
import { validateArticle, validateArticleDraft } from '@org/schema';
import { randomUUID } from 'node:crypto';
import { matchesApiKey } from '../common/api-key.js';
import type { AppProfileRepository } from '../storage/app-profile-repository.port.js';
import { SlugConflictError } from '../storage/article-repository.port.js';
import type { ArticleRepository } from '../storage/article-repository.port.js';
import { APP_PROFILE_REPOSITORY, ARTICLE_REPOSITORY } from '../storage/tokens.js';
import { PublishEvents } from './publish-events.js';

export class ArticleValidationException extends BadRequestException {
  constructor(errors: ValidationError[]) {
    super({ message: 'article validation failed', errors });
  }
}

@Injectable()
export class ArticlesService {
  constructor(
    @Inject(ARTICLE_REPOSITORY) private readonly articles: ArticleRepository,
    @Inject(APP_PROFILE_REPOSITORY) private readonly apps: AppProfileRepository,
    private readonly events: PublishEvents,
  ) {}

  private async loadProfile(appId: string) {
    const stored = await this.apps.findById(appId);
    if (!stored) {
      throw new NotFoundException(`app "${appId}" not found`);
    }
    return stored.profile;
  }

  private async loadArticle(appId: string, id: string): Promise<Article> {
    const article = await this.articles.findById(appId, id);
    if (!article) {
      throw new NotFoundException(`article "${id}" not found for app "${appId}"`);
    }
    return article;
  }

  async createDraft(appId: string, input: ArticleDraftInput): Promise<Article> {
    if (input.appId !== appId) {
      throw new BadRequestException(`body.appId "${input.appId}" does not match route app "${appId}"`);
    }
    const profile = await this.loadProfile(appId);
    const now = new Date().toISOString();
    const candidate: Article = { ...input, id: randomUUID(), status: 'draft', createdAt: now, updatedAt: now };

    const result = validateArticle(candidate, profile);
    if (!result.valid) {
      throw new ArticleValidationException(result.errors);
    }
    try {
      return await this.articles.create(result.value);
    } catch (error) {
      if (error instanceof SlugConflictError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async update(appId: string, id: string, patch: Partial<ArticleDraftInput>): Promise<Article> {
    const profile = await this.loadProfile(appId);
    const existing = await this.loadArticle(appId, id);
    const merged: Article = {
      ...existing,
      ...patch,
      id: existing.id,
      appId,
      status: existing.status,
      updatedAt: new Date().toISOString(),
    };

    const result = validateArticle(merged, profile);
    if (!result.valid) {
      throw new ArticleValidationException(result.errors);
    }
    try {
      return await this.articles.update(result.value);
    } catch (error) {
      if (error instanceof SlugConflictError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  async publish(appId: string, id: string): Promise<Article> {
    const profile = await this.loadProfile(appId);
    const existing = await this.loadArticle(appId, id);
    const toPublish: Article = { ...existing, status: 'published', updatedAt: new Date().toISOString() };

    const result = validateArticle(toPublish, profile);
    if (!result.valid) {
      throw new ArticleValidationException(result.errors);
    }
    const saved = await this.articles.update(result.value);
    this.events.emitPublished(saved);
    return saved;
  }

  async validateForPublish(appId: string, input: unknown) {
    const profile = await this.loadProfile(appId);
    return validateArticleDraft(input, profile);
  }

  async get(appId: string, id: string): Promise<Article> {
    return this.loadArticle(appId, id);
  }

  async getPublishedBySlug(appId: string, slug: string): Promise<Article> {
    const article = await this.articles.findBySlug(appId, slug);
    if (!article || article.status !== 'published') {
      throw new NotFoundException(`published article "${slug}" not found for app "${appId}"`);
    }
    return article;
  }

  /**
   * Public callers (no key, or a wrong one) see only published articles.
   * A caller presenting the app's own valid key — the authoring tool's own
   * view — sees drafts too.
   */
  async listForCaller(appId: string, apiKey?: string): Promise<Article[]> {
    const stored = await this.apps.findById(appId);
    if (!stored) {
      throw new NotFoundException(`app "${appId}" not found`);
    }
    const isAuthedCaller = !!apiKey && matchesApiKey(apiKey, stored.apiKeyHash);
    return this.articles.list(appId, isAuthedCaller ? undefined : { status: 'published' });
  }
}
