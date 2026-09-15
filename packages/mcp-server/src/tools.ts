import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { articleDraftInputSchema } from '@org/schema';
import { z } from 'zod';
import type { RestClient } from './rest-client.js';
import { runTool } from './tool-result.js';

const appIdSchema = z.object({ appId: z.string().min(1) });
const articleRefSchema = z.object({ appId: z.string().min(1), id: z.string().min(1) });
const updateArticleInputSchema = articleDraftInputSchema.partial().extend({
  appId: z.string().min(1),
  id: z.string().min(1),
});

export function registerTools(server: McpServer, client: RestClient): void {
  server.registerTool(
    'list_apps',
    { description: 'List every registered app (destination site), each with its own voice and design tokens.' },
    () => runTool(() => client.listApps()),
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
    { description: 'Get one article (any status) by id.', inputSchema: articleRefSchema.shape },
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
        'Create a draft article. blocks must use only types listed in the app profile\'s allowedBlockTypes ' +
        '— call get_app_profile first. The result is a draft; call publish_article to make it public.',
      inputSchema: articleDraftInputSchema.shape,
    },
    (input) => runTool(() => client.createArticle(input)),
  );

  server.registerTool(
    'update_article',
    {
      description: 'Update fields on an existing draft or published article. Only the given fields are changed.',
      inputSchema: updateArticleInputSchema.shape,
    },
    ({ appId, id, ...patch }) => runTool(() => client.updateArticle(appId, id, patch)),
  );

  server.registerTool(
    'publish_article',
    { description: 'Transition a draft article to published, making it publicly visible.', inputSchema: articleRefSchema.shape },
    ({ appId, id }) => runTool(() => client.publishArticle(appId, id)),
  );
}
