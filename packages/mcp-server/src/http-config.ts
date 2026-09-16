import os from 'node:os';
import path from 'node:path';

export interface HttpConfig {
  restApiBaseUrl: string;
  /** Shared secret for the service-gated per-user endpoints on rest-api (x-service-key). */
  serviceKey: string;
  /** Symmetric signing key for stateless auth-code/access/refresh JWTs. */
  jwtSigningKey: string;
  storageDriver: 'dynamodb' | 'local';
  oauthClientsTable: string;
  oauthClientsFile: string;
  oauthUsedCodesTable: string;
  port: number;
}

/**
 * Deliberately no issuer-URL setting here — the OAuth issuer is derived
 * per-request from the Host header in http-main.ts (see the comment there
 * for why: injecting this server's own Function URL into its own Lambda
 * environment would create a circular CloudFormation dependency).
 */
export function loadHttpConfig(
  env: NodeJS.ProcessEnv = process.env,
): HttpConfig {
  const serviceKey = env['MCP_SERVICE_KEY'];
  const jwtSigningKey = env['MCP_JWT_SIGNING_KEY'];
  if (!serviceKey) {
    throw new Error('MCP_SERVICE_KEY is required to run in HTTP mode');
  }
  if (!jwtSigningKey) {
    throw new Error('MCP_JWT_SIGNING_KEY is required to run in HTTP mode');
  }

  return {
    restApiBaseUrl: env['REST_API_BASE_URL'] ?? 'http://localhost:3000/api',
    serviceKey,
    jwtSigningKey,
    storageDriver: env['STORAGE_DRIVER'] === 'dynamodb' ? 'dynamodb' : 'local',
    oauthClientsTable:
      env['DYNAMODB_OAUTH_CLIENTS_TABLE'] ?? 'ai-article-mcp-oauth-clients',
    oauthClientsFile:
      env['MCP_OAUTH_CLIENTS_FILE'] ??
      path.join(os.homedir(), '.ai-article-mcp', 'oauth-clients.json'),
    oauthUsedCodesTable:
      env['DYNAMODB_OAUTH_USED_CODES_TABLE'] ??
      'ai-article-mcp-oauth-used-codes',
    port: Number(env['PORT'] ?? 8080),
  };
}
