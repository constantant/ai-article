import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppProfile, Article } from '@org/schema';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { McpServerConfig } from './config.js';
import { persistKey } from './key-store.js';
import { RestApiError } from './rest-client.js';
import type { RestClient } from './rest-client.js';
import { registerTools } from './tools.js';

function fakeProfile(): AppProfile {
  return {
    appId: 'tech-blog',
    name: 'Tech Blog',
    voice: { tone: 'terse', audience: 'engineers' },
    allowedBlockTypes: ['heading', 'paragraph'],
    designTokens: { 'color-surface': '#000' },
  };
}

function fakeArticle(): Article {
  return {
    id: 'a1',
    appId: 'tech-blog',
    slug: 'hello',
    title: 'Hello',
    status: 'draft',
    schemaVersion: 1,
    blocks: [{ type: 'heading', level: 1, text: 'Hello' }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function textOf(result: Record<string, unknown>): unknown {
  const content = result['content'] as Array<{ type: string; text: string }>;
  return JSON.parse(content[0].text);
}

describe('MCP tools', () => {
  let client: Client;
  let restClient: RestClient;
  let keysFilePath: string;

  beforeEach(async () => {
    keysFilePath = join(tmpdir(), `mcp-tools-spec-keys-${Date.now()}.json`);
    const config: McpServerConfig = {
      restApiBaseUrl: 'http://localhost:3000/api',
      appApiKeys: {},
      keysFilePath,
    };

    restClient = {
      listApps: vi.fn(),
      registerApp: vi.fn(),
      createApp: vi.fn(),
      deleteApp: vi.fn(),
      getAppProfile: vi.fn(),
      listArticles: vi.fn(),
      getArticle: vi.fn(),
      getPublishedBySlug: vi.fn(),
      createArticle: vi.fn(),
      updateArticle: vi.fn(),
      publishArticle: vi.fn(),
      validateArticle: vi.fn(),
    } as unknown as RestClient;

    const server = new McpServer({ name: 'test-server', version: '0.0.0' });
    registerTools(server, restClient, config);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);
  });

  afterEach(() => {
    if (existsSync(keysFilePath)) {
      rmSync(keysFilePath, { force: true });
    }
  });

  it('list_apps calls RestClient.listApps and returns its data as tool content', async () => {
    vi.mocked(restClient.listApps).mockResolvedValue([fakeProfile()]);

    const result = await client.callTool({ name: 'list_apps', arguments: {} });

    expect(restClient.listApps).toHaveBeenCalled();
    expect(textOf(result)).toEqual([fakeProfile()]);
  });

  it('register_app forwards the full profile, returns the new api key, and persists it to disk', async () => {
    vi.mocked(restClient.registerApp).mockResolvedValue({
      profile: fakeProfile(),
      apiKey: 'self-served-key',
    });

    const result = await client.callTool({
      name: 'register_app',
      arguments: fakeProfile(),
    });

    expect(restClient.registerApp).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'tech-blog' }),
    );
    expect(textOf(result)).toEqual({
      profile: fakeProfile(),
      apiKey: 'self-served-key',
    });
    expect(JSON.parse(readFileSync(keysFilePath, 'utf8'))).toEqual({
      'tech-blog': 'self-served-key',
    });
  });

  it('register_app surfaces a registration-full error as an isError result, not a throw', async () => {
    vi.mocked(restClient.registerApp).mockRejectedValue(
      new Error('self-serve app registration is full for now'),
    );

    const result = await client.callTool({
      name: 'register_app',
      arguments: fakeProfile(),
    });

    expect(result.isError).toBe(true);
  });

  it('delete_app forwards appId and removes any persisted key for it', async () => {
    persistKey(keysFilePath, 'tech-blog', 'stale-key');
    persistKey(keysFilePath, 'other-app', 'unrelated-key');
    vi.mocked(restClient.deleteApp).mockResolvedValue(undefined);

    const result = await client.callTool({
      name: 'delete_app',
      arguments: { appId: 'tech-blog' },
    });

    expect(restClient.deleteApp).toHaveBeenCalledWith('tech-blog');
    expect(textOf(result)).toEqual({ deleted: 'tech-blog' });
    expect(JSON.parse(readFileSync(keysFilePath, 'utf8'))).toEqual({
      'other-app': 'unrelated-key',
    });
  });

  it('delete_app surfaces an unauthorized error as an isError result, not a throw', async () => {
    vi.mocked(restClient.deleteApp).mockRejectedValue(
      new RestApiError(401, { message: 'unauthorized' }),
    );

    const result = await client.callTool({
      name: 'delete_app',
      arguments: { appId: 'tech-blog' },
    });

    expect(result.isError).toBe(true);
  });

  it('create_app forwards the full profile and returns the new api key', async () => {
    vi.mocked(restClient.createApp).mockResolvedValue({
      profile: fakeProfile(),
      apiKey: 'new-key',
    });

    const result = await client.callTool({
      name: 'create_app',
      arguments: fakeProfile(),
    });

    expect(restClient.createApp).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'tech-blog' }),
    );
    expect(textOf(result)).toEqual({
      profile: fakeProfile(),
      apiKey: 'new-key',
    });
  });

  it('create_app surfaces a missing-admin-key error as an isError result, not a throw', async () => {
    vi.mocked(restClient.createApp).mockRejectedValue(
      new Error('no admin key configured for this server'),
    );

    const result = await client.callTool({
      name: 'create_app',
      arguments: fakeProfile(),
    });

    expect(result.isError).toBe(true);
  });

  it('get_app_profile forwards appId', async () => {
    vi.mocked(restClient.getAppProfile).mockResolvedValue(fakeProfile());

    const result = await client.callTool({
      name: 'get_app_profile',
      arguments: { appId: 'tech-blog' },
    });

    expect(restClient.getAppProfile).toHaveBeenCalledWith('tech-blog');
    expect(textOf(result)).toEqual(fakeProfile());
  });

  it('create_article forwards the full draft input', async () => {
    vi.mocked(restClient.createArticle).mockResolvedValue(fakeArticle());
    const draft = {
      appId: 'tech-blog',
      slug: 'hello',
      title: 'Hello',
      blocks: [{ type: 'heading', level: 1, text: 'Hello' }],
    };

    await client.callTool({ name: 'create_article', arguments: draft });

    expect(restClient.createArticle).toHaveBeenCalledWith(
      expect.objectContaining(draft),
    );
  });

  it('update_article splits appId/id from the patch fields', async () => {
    vi.mocked(restClient.updateArticle).mockResolvedValue(fakeArticle());

    await client.callTool({
      name: 'update_article',
      arguments: { appId: 'tech-blog', id: 'a1', title: 'New Title' },
    });

    // schemaVersion carries a Zod .default(), so it survives .partial() and is
    // always present after parsing — that's expected, not a bug being masked.
    expect(restClient.updateArticle).toHaveBeenCalledWith(
      'tech-blog',
      'a1',
      expect.objectContaining({ title: 'New Title' }),
    );
  });

  it('publish_article forwards appId and id', async () => {
    vi.mocked(restClient.publishArticle).mockResolvedValue({
      ...fakeArticle(),
      status: 'published',
    });

    const result = await client.callTool({
      name: 'publish_article',
      arguments: { appId: 'tech-blog', id: 'a1' },
    });

    expect(restClient.publishArticle).toHaveBeenCalledWith('tech-blog', 'a1');
    expect((textOf(result) as Article).status).toBe('published');
  });

  it('translates a RestApiError into an isError tool result instead of throwing', async () => {
    vi.mocked(restClient.getAppProfile).mockRejectedValue(
      new RestApiError(404, { message: 'not found' }),
    );

    const result = await client.callTool({
      name: 'get_app_profile',
      arguments: { appId: 'nope' },
    });

    expect(result.isError).toBe(true);
  });
});
