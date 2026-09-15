import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { registerResources } from './resources.js';
import { RestClient } from './rest-client.js';
import { registerTools } from './tools.js';

async function main() {
  const config = loadConfig();
  const client = new RestClient(config);

  const server = new McpServer({
    name: 'ai-article-platform',
    version: '0.1.0',
  });
  registerTools(server, client);
  registerResources(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is the MCP transport's wire — never console.log; stderr is safe for diagnostics.
  console.error(
    `ai-article-platform MCP server connected (REST API: ${config.restApiBaseUrl})`,
  );
}

main().catch((error: unknown) => {
  console.error('mcp-server failed to start:', error);
  process.exit(1);
});
