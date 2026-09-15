export interface McpServerConfig {
  restApiBaseUrl: string;
  /** appId -> API key, so the Skill/model never handles raw credentials. */
  appApiKeys: Record<string, string>;
  /** Required only for the create_app tool (POST /apps needs x-admin-key). */
  adminApiKey?: string;
}

function parseAppApiKeys(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        'APP_API_KEYS must be a JSON object of { [appId]: apiKey }',
      );
    }
    return parsed as Record<string, string>;
  } catch (error) {
    throw new Error(
      `failed to parse APP_API_KEYS: ${(error as Error).message}`,
    );
  }
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpServerConfig {
  return {
    restApiBaseUrl: env['REST_API_BASE_URL'] ?? 'http://localhost:3000/api',
    appApiKeys: parseAppApiKeys(env['APP_API_KEYS']),
    adminApiKey: env['ADMIN_API_KEY'],
  };
}
