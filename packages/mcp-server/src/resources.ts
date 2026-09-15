import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { appProfileJsonSchema, articleDraftInputJsonSchema, articleJsonSchema } from '@org/schema';
import type { RestClient } from './rest-client.js';

function jsonContents(uri: URL, data: unknown) {
  return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }] };
}

export function registerResources(server: McpServer, client: RestClient): void {
  server.registerResource(
    'article-schema',
    'schema://article',
    {
      title: 'Article JSON Schema',
      description: 'The full stored Article shape (id, status, timestamps, blocks, ...). Read-only reference.',
      mimeType: 'application/json',
    },
    (uri) => jsonContents(uri, articleJsonSchema()),
  );

  server.registerResource(
    'article-draft-schema',
    'schema://article-draft',
    {
      title: 'Article Draft Input JSON Schema',
      description: 'The shape expected by create_article/validate_article — no id/status/timestamps yet.',
      mimeType: 'application/json',
    },
    (uri) => jsonContents(uri, articleDraftInputJsonSchema()),
  );

  server.registerResource(
    'app-profile-schema',
    'schema://app-profile',
    {
      title: 'App Profile JSON Schema',
      description: 'The shape returned by get_app_profile.',
      mimeType: 'application/json',
    },
    (uri) => jsonContents(uri, appProfileJsonSchema()),
  );

  server.registerResource(
    'app-profile',
    new ResourceTemplate('profile://{appId}', { list: undefined }),
    {
      title: "An app's profile",
      description: 'Voice, allowed block types, content conventions, and design tokens for one app.',
      mimeType: 'application/json',
    },
    async (uri, variables) => jsonContents(uri, await client.getAppProfile(String(variables['appId']))),
  );

  server.registerResource(
    'article-example',
    new ResourceTemplate('example://{appId}/{id}', { list: undefined }),
    {
      title: 'An existing article, for few-shot grounding',
      description: "Fetch one of an app's existing articles by id to see its structure and tone in practice.",
      mimeType: 'application/json',
    },
    async (uri, variables) =>
      jsonContents(uri, await client.getArticle(String(variables['appId']), String(variables['id']))),
  );
}
