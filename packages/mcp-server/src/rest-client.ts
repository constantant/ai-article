import type {
  AppProfile,
  Article,
  ArticleDraftInput,
  ValidationResult,
} from '@org/schema';

/**
 * The subset of McpServerConfig that RestClient actually needs — split out
 * so an HTTP request handler can build one per request (with per-user
 * appApiKeys resolved from an authenticated caller) without needing a fake
 * keysFilePath, which only ever makes sense for the stdio process's local
 * key-store.
 */
export interface RestClientConfig {
  restApiBaseUrl: string;
  /** appId -> API key, so the Skill/model never handles raw credentials. */
  appApiKeys: Record<string, string>;
  /** Required only for the create_app tool (POST /apps needs x-admin-key). */
  adminApiKey?: string;
}

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
  adminKey?: string;
  body?: unknown;
}

/**
 * Thin, stateless HTTP client — no business logic lives here. Every method
 * maps 1:1 to a REST endpoint; validation and persistence stay server-side
 * so the MCP tools and the REST API can never disagree about what's valid.
 */
export class RestClient {
  /** Seeded from config.appApiKeys; createApp() adds to this at runtime so a
   *  newly created app is immediately usable without restarting the server. */
  private readonly appApiKeys: Map<string, string>;

  constructor(private readonly config: RestClientConfig) {
    this.appApiKeys = new Map(Object.entries(config.appApiKeys));
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (options.apiKey) {
      headers['x-api-key'] = options.apiKey;
    }
    if (options.adminKey) {
      headers['x-admin-key'] = options.adminKey;
    }

    const res = await fetch(`${this.config.restApiBaseUrl}${path}`, {
      method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new RestApiError(res.status, data);
    }
    return data as T;
  }

  private tryApiKeyFor(appId: string): string | undefined {
    return this.appApiKeys.get(appId);
  }

  private apiKeyFor(appId: string): string {
    const key = this.tryApiKeyFor(appId);
    if (!key) {
      throw new Error(
        `no API key configured for app "${appId}" — set it in the APP_API_KEYS env var`,
      );
    }
    return key;
  }

  listApps(): Promise<AppProfile[]> {
    return this.request('GET', '/apps');
  }

  async createApp(
    profile: AppProfile,
  ): Promise<{ profile: AppProfile; apiKey: string }> {
    if (!this.config.adminApiKey) {
      throw new Error(
        'no admin key configured for this server — set ADMIN_API_KEY to allow creating apps',
      );
    }
    const result = await this.request<{ profile: AppProfile; apiKey: string }>(
      'POST',
      '/apps',
      {
        adminKey: this.config.adminApiKey,
        body: profile,
      },
    );
    // So create_article/publish_article etc. work for this app right away.
    this.appApiKeys.set(profile.appId, result.apiKey);
    return result;
  }

  /** Self-serve registration — no admin key needed, unlike createApp(). */
  async registerApp(
    profile: AppProfile,
  ): Promise<{ profile: AppProfile; apiKey: string }> {
    const result = await this.request<{ profile: AppProfile; apiKey: string }>(
      'POST',
      '/apps/self-serve',
      { body: profile },
    );
    this.appApiKeys.set(profile.appId, result.apiKey);
    return result;
  }

  /** Deletes an app and all its articles, using whichever key we hold for it. */
  async deleteApp(appId: string): Promise<void> {
    await this.request('DELETE', `/apps/${encodeURIComponent(appId)}`, {
      apiKey: this.tryApiKeyFor(appId),
      adminKey: this.config.adminApiKey,
    });
    this.appApiKeys.delete(appId);
  }

  getAppProfile(appId: string): Promise<AppProfile> {
    return this.request('GET', `/apps/${encodeURIComponent(appId)}`);
  }

  /** Published-only for apps we hold no key for; drafts too for apps we do. */
  listArticles(appId: string): Promise<Article[]> {
    return this.request('GET', `/apps/${encodeURIComponent(appId)}/articles`, {
      apiKey: this.tryApiKeyFor(appId),
    });
  }

  getArticle(appId: string, id: string): Promise<Article> {
    return this.request(
      'GET',
      `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}`,
      {
        apiKey: this.apiKeyFor(appId),
      },
    );
  }

  getPublishedBySlug(appId: string, slug: string): Promise<Article> {
    return this.request(
      'GET',
      `/apps/${encodeURIComponent(appId)}/articles/by-slug/${encodeURIComponent(slug)}`,
    );
  }

  createArticle(input: ArticleDraftInput): Promise<Article> {
    return this.request(
      'POST',
      `/apps/${encodeURIComponent(input.appId)}/articles`,
      {
        apiKey: this.apiKeyFor(input.appId),
        body: input,
      },
    );
  }

  updateArticle(
    appId: string,
    id: string,
    patch: Partial<ArticleDraftInput>,
  ): Promise<Article> {
    return this.request(
      'PATCH',
      `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}`,
      {
        apiKey: this.apiKeyFor(appId),
        body: patch,
      },
    );
  }

  publishArticle(appId: string, id: string): Promise<Article> {
    return this.request(
      'POST',
      `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}/publish`,
      {
        apiKey: this.apiKeyFor(appId),
      },
    );
  }

  deleteArticle(appId: string, id: string): Promise<void> {
    return this.request(
      'DELETE',
      `/apps/${encodeURIComponent(appId)}/articles/${encodeURIComponent(id)}`,
      {
        apiKey: this.apiKeyFor(appId),
      },
    );
  }

  validateArticle(
    appId: string,
    input: unknown,
  ): Promise<ValidationResult<ArticleDraftInput>> {
    return this.request(
      'POST',
      `/apps/${encodeURIComponent(appId)}/articles/validate`,
      {
        apiKey: this.apiKeyFor(appId),
        body: input,
      },
    );
  }
}
