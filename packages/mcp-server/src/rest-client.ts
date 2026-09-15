import type { AppProfile, Article, ArticleDraftInput, ValidationResult } from '@org/schema';
import type { McpServerConfig } from './config.js';

export class RestApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`REST API error ${status}: ${JSON.stringify(body)}`);
    this.name = 'RestApiError';
  }
}

interface RequestOptions {
  apiKey?: string;
  body?: unknown;
}

/**
 * Thin, stateless HTTP client — no business logic lives here. Every method
 * maps 1:1 to a REST endpoint; validation and persistence stay server-side
 * so the MCP tools and the REST API can never disagree about what's valid.
 */
export class RestClient {
  constructor(private readonly config: McpServerConfig) {}

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (options.apiKey) {
      headers['x-api-key'] = options.apiKey;
    }

    const res = await fetch(`${this.config.restApiBaseUrl}${path}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new RestApiError(res.status, data);
    }
    return data as T;
  }

  private tryApiKeyFor(appId: string): string | undefined {
    return this.config.appApiKeys[appId];
  }

  private apiKeyFor(appId: string): string {
    const key = this.tryApiKeyFor(appId);
    if (!key) {
      throw new Error(`no API key configured for app "${appId}" — set it in the APP_API_KEYS env var`);
    }
    return key;
  }

  listApps(): Promise<AppProfile[]> {
    return this.request('GET', '/apps');
  }

  getAppProfile(appId: string): Promise<AppProfile> {
    return this.request('GET', `/apps/${encodeURIComponent(appId)}`);
  }

  /** Published-only for apps we hold no key for; drafts too for apps we do. */
  listArticles(appId: string): Promise<Article[]> {
    return this.request('GET', `/apps/${encodeURIComponent(appId)}/articles`, { apiKey: this.tryApiKeyFor(appId) });
  }

  getArticle(appId: string, id: string): Promise<Article> {
    return this.request('GET', `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}`, {
      apiKey: this.apiKeyFor(appId),
    });
  }

  getPublishedBySlug(appId: string, slug: string): Promise<Article> {
    return this.request('GET', `/apps/${encodeURIComponent(appId)}/articles/by-slug/${encodeURIComponent(slug)}`);
  }

  createArticle(input: ArticleDraftInput): Promise<Article> {
    return this.request('POST', `/apps/${encodeURIComponent(input.appId)}/articles`, {
      apiKey: this.apiKeyFor(input.appId),
      body: input,
    });
  }

  updateArticle(appId: string, id: string, patch: Partial<ArticleDraftInput>): Promise<Article> {
    return this.request('PATCH', `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}`, {
      apiKey: this.apiKeyFor(appId),
      body: patch,
    });
  }

  publishArticle(appId: string, id: string): Promise<Article> {
    return this.request('POST', `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}/publish`, {
      apiKey: this.apiKeyFor(appId),
    });
  }

  validateArticle(appId: string, input: unknown): Promise<ValidationResult<ArticleDraftInput>> {
    return this.request('POST', `/apps/${encodeURIComponent(appId)}/articles/validate`, {
      apiKey: this.apiKeyFor(appId),
      body: input,
    });
  }
}
