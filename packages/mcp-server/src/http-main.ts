import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { loadHttpConfig } from './http-config.js';
import {
  DynamoDbClientRecordStore,
  LocalFileClientRecordStore,
  OAuthClientStore,
} from './oauth/client-store.js';
import { JwtIssuer } from './oauth/jwt.js';
import { AiArticleOAuthProvider } from './oauth/provider.js';
import type { UsedCodeGuard } from './oauth/used-codes.js';
import {
  DynamoDbUsedCodeGuard,
  InMemoryUsedCodeGuard,
} from './oauth/used-codes.js';
import { UsersApiClient } from './oauth/users-api-client.js';
import { registerResources } from './resources.js';
import { RestClient } from './rest-client.js';
import { fetchUserAppKeys, RestApiKeyStore } from './rest-key-store.js';
import { registerTools } from './tools.js';

const config = loadHttpConfig();

const clientRecordStore =
  config.storageDriver === 'dynamodb'
    ? new DynamoDbClientRecordStore(config.oauthClientsTable)
    : new LocalFileClientRecordStore(config.oauthClientsFile);

const usedCodes: UsedCodeGuard =
  config.storageDriver === 'dynamodb'
    ? new DynamoDbUsedCodeGuard(config.oauthUsedCodesTable)
    : new InMemoryUsedCodeGuard();

const provider = new AiArticleOAuthProvider(
  new OAuthClientStore(clientRecordStore),
  new JwtIssuer(config.jwtSigningKey),
  usedCodes,
  new UsersApiClient(config.restApiBaseUrl, config.serviceKey),
);

/**
 * mcpAuthRouter's metadata bakes in one issuer origin, echoed verbatim into
 * every signed endpoint URL it advertises. That origin must be this
 * server's own public URL, which we only learn per-request (from the Host
 * header) — injecting it via an env var would create a circular
 * CloudFormation dependency (the Lambda function's env referencing its own
 * Function URL, which itself depends on the function). Built lazily and
 * cached per distinct Host; otherwise stateless, so caching across a warm
 * container is safe.
 *
 * resourceServerUrl is the issuer origin itself (no /mcp suffix) so that
 * the exact URL this stack hands out (packages/infra's McpServerUrl output
 * — the bare Function URL) is both the OAuth resource identifier and the
 * actual MCP endpoint below. Splitting these into two different URLs is a
 * common MCP-server convention, but it means whoever configures a client
 * has to remember to append a path segment nobody told them about — not
 * worth it here when the deployed URL can just be the one thing to paste.
 */
const authRoutersByHost = new Map<string, RequestHandler>();
function authRouterFor(req: Request): RequestHandler {
  const host = req.headers.host ?? 'localhost';
  const cached = authRoutersByHost.get(host);
  if (cached) {
    return cached;
  }
  const issuerUrl = new URL(`${req.protocol}://${host}`);
  const router = mcpAuthRouter({
    provider,
    issuerUrl,
    resourceServerUrl: issuerUrl,
  });
  authRoutersByHost.set(host, router);
  return router;
}

const app = express();
// Lambda Web Adapter terminates TLS at the edge and forwards
// X-Forwarded-Proto/Host — trust it so req.protocol reflects the real
// public scheme (needed for the issuer-URL derivation above).
app.set('trust proxy', true);

app.use((req: Request, res: Response, next: NextFunction) => {
  authRouterFor(req)(req, res, next);
});

const bearerAuth = requireBearerAuth({ verifier: provider });

app.post('/', express.json(), bearerAuth, async (req, res) => {
  const userId = req.auth?.extra?.['userId'];
  if (typeof userId !== 'string') {
    res.status(401).json({ error: 'token has no associated user' });
    return;
  }

  try {
    const appApiKeys = await fetchUserAppKeys(
      config.restApiBaseUrl,
      config.serviceKey,
      userId,
    );
    const client = new RestClient({
      restApiBaseUrl: config.restApiBaseUrl,
      appApiKeys,
    });
    const keyStore = new RestApiKeyStore({
      restApiBaseUrl: config.restApiBaseUrl,
      serviceKey: config.serviceKey,
      userId,
    });

    // Stateless mode: a fresh McpServer/transport per request, matching the
    // SDK's own intended pattern for StreamableHTTPServerTransport with
    // sessionIdGenerator: undefined — nothing here is safe to reuse across
    // requests since each caller may be a different authenticated user.
    const server = new McpServer({
      name: 'ai-article-platform',
      version: '0.1.0',
    });
    registerTools(server, client, keyStore);
    registerResources(server, client);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('mcp request failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal server error' });
    }
  }
});

app.get('/', (_req, res) => {
  res.status(405).json({
    error: 'GET is not supported — this server runs stateless, no SSE',
  });
});
app.delete('/', (_req, res) => {
  res.status(405).json({
    error: 'DELETE is not supported — this server runs stateless, no sessions',
  });
});

app.listen(config.port, () => {
  // stdout is fine here — this is the HTTP entrypoint, not the stdio MCP
  // transport's wire (contrast main.ts, which must never console.log).
  console.log(
    `ai-article-platform MCP HTTP server listening on :${config.port}`,
  );
});
