import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { appProfileSchema, articleDraftInputSchema } from '@org/schema';
import { z } from 'zod';
import type { McpServerConfig } from './config.js';
import { persistKey, removeKey } from './key-store.js';
import type { RestClient } from './rest-client.js';
import { runTool } from './tool-result.js';

const appIdSchema = z.object({ appId: z.string().min(1) });
const articleRefSchema = z.object({
  appId: z.string().min(1),
  id: z.string().min(1),
});
const updateArticleInputSchema = articleDraftInputSchema.partial().extend({
  appId: z.string().min(1),
  id: z.string().min(1),
});

export function registerTools(
  server: McpServer,
  client: RestClient,
  config: McpServerConfig,
): void {
  server.registerTool(
    'list_apps',
    {
      description:
        'List every registered app (destination site), each with its own voice and design tokens.',
    },
    () => runTool(() => client.listApps()),
  );

  server.registerTool(
    'register_app',
    {
      description:
        'Register a new app (destination site) with its own voice, allowed block types, and design ' +
        'tokens — no admin key required. This is the normal, self-serve way to get started. Returns the ' +
        "new app's profile and API key; this server remembers that key (in memory for this session, and " +
        'on disk so it still works after a restart), so articles can be authored for the new app ' +
        'immediately. Self-serve registration is capped globally to bound abuse — if it fails saying ' +
        'registration is full, tell the user to ask the maintainer to register the app instead (create_app).',
      inputSchema: appProfileSchema.shape,
    },
    (profile) =>
      runTool(async () => {
        const result = await client.registerApp(profile);
        persistKey(config.keysFilePath, profile.appId, result.apiKey);
        return result;
      }),
  );

  server.registerTool(
    'create_app',
    {
      description:
        'Register a new app (destination site) as an operator, with its own voice, allowed block types, ' +
        'and design tokens. Requires this server to hold an admin key (ADMIN_API_KEY) — most users should ' +
        'use register_app instead, which needs no admin key. If this fails with a missing-admin-key error, ' +
        'use register_app, or tell the user to add ADMIN_API_KEY if they specifically need this tool. ' +
        "Returns the new app's profile and API key; this server remembers that key for the rest of the " +
        'session, so articles can be authored for the new app immediately without reconfiguring anything.',
      inputSchema: appProfileSchema.shape,
    },
    (profile) => runTool(() => client.createApp(profile)),
  );

  server.registerTool(
    'delete_app',
    {
      description:
        "Permanently delete an app and all its articles — there's no undo. Requires either that app's " +
        'own API key (which this server already holds if it registered or was given the app) or an ' +
        'admin key. Confirm with the user before calling this — it destroys published content.',
      inputSchema: appIdSchema.shape,
    },
    ({ appId }) =>
      runTool(async () => {
        await client.deleteApp(appId);
        removeKey(config.keysFilePath, appId);
        return { deleted: appId };
      }),
  );

  server.registerTool(
    'get_app_profile',
    {
      description:
        "Get one app's profile: voice/tone, allowed block types, content conventions, and design tokens. " +
        'Call this before drafting an article for an app.',
      inputSchema: appIdSchema.shape,
    },
    ({ appId }) => runTool(() => client.getAppProfile(appId)),
  );

  server.registerTool(
    'list_articles',
    {
      description:
        "List an app's articles. Drafts are included only when this server holds that app's API key " +
        '(configured via APP_API_KEYS); otherwise only published articles are returned.',
      inputSchema: appIdSchema.shape,
    },
    ({ appId }) => runTool(() => client.listArticles(appId)),
  );

  server.registerTool(
    'get_article',
    {
      description: 'Get one article (any status) by id.',
      inputSchema: articleRefSchema.shape,
    },
    ({ appId, id }) => runTool(() => client.getArticle(appId, id)),
  );

  server.registerTool(
    'validate_article',
    {
      description:
        'Dry-run validate a draft article against its app profile (schema + allowed block types) without ' +
        'persisting anything. Call this before create_article/publish_article to catch rejections early.',
      inputSchema: articleDraftInputSchema.shape,
    },
    (input) => runTool(() => client.validateArticle(input.appId, input)),
  );

  server.registerTool(
    'create_article',
    {
      description:
        "Create a draft article. blocks must use only types listed in the app profile's allowedBlockTypes " +
        '— call get_app_profile first. The result is a draft; call publish_article to make it public.',
      inputSchema: articleDraftInputSchema.shape,
    },
    (input) => runTool(() => client.createArticle(input)),
  );

  server.registerTool(
    'update_article',
    {
      description:
        'Update fields on an existing draft or published article. Only the given fields are changed.',
      inputSchema: updateArticleInputSchema.shape,
    },
    ({ appId, id, ...patch }) =>
      runTool(() => client.updateArticle(appId, id, patch)),
  );

  server.registerTool(
    'publish_article',
    {
      description:
        'Transition a draft article to published, making it publicly visible.',
      inputSchema: articleRefSchema.shape,
    },
    ({ appId, id }) => runTool(() => client.publishArticle(appId, id)),
  );
}
