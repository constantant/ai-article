import type { KeyStore } from './key-store.js';

export interface RestApiKeyStoreConfig {
  restApiBaseUrl: string;
  serviceKey: string;
  userId: string;
}

/**
 * Persists a user's per-app keys server-side via rest-api's service-gated
 * per-user endpoints, replacing LocalFileKeyStore for the HTTP/OAuth path —
 * there is no local disk to durably write to in Lambda, and the whole point
 * of per-user OAuth is that each caller's keys are their own, not shared
 * process-wide state.
 */
export class RestApiKeyStore implements KeyStore {
  constructor(private readonly config: RestApiKeyStoreConfig) {}

  async persist(appId: string, apiKey: string): Promise<void> {
    const res = await fetch(this.url(appId), {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-service-key': this.config.serviceKey,
      },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      throw new Error(
        `failed to persist app key for "${appId}": ${res.status}`,
      );
    }
  }

  async remove(appId: string): Promise<void> {
    const res = await fetch(this.url(appId), {
      method: 'DELETE',
      headers: { 'x-service-key': this.config.serviceKey },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`failed to remove app key for "${appId}": ${res.status}`);
    }
  }

  async get(appId: string): Promise<string | undefined> {
    const res = await fetch(this.url(appId), {
      headers: { 'x-service-key': this.config.serviceKey },
    });
    if (res.status === 404) {
      return undefined;
    }
    if (!res.ok) {
      throw new Error(`failed to fetch app key for "${appId}": ${res.status}`);
    }
    const body = (await res.json()) as { apiKey: string };
    return body.apiKey;
  }

  private url(appId: string): string {
    return `${this.config.restApiBaseUrl}/users/${encodeURIComponent(this.config.userId)}/app-keys/${encodeURIComponent(appId)}`;
  }
}

/** Fetches a user's full {appId: apiKey} map, to seed a per-request RestClient. */
export async function fetchUserAppKeys(
  restApiBaseUrl: string,
  serviceKey: string,
  userId: string,
): Promise<Record<string, string>> {
  const res = await fetch(
    `${restApiBaseUrl}/users/${encodeURIComponent(userId)}/app-keys`,
    { headers: { 'x-service-key': serviceKey } },
  );
  if (!res.ok) {
    throw new Error(
      `failed to fetch app keys for user "${userId}": ${res.status}`,
    );
  }
  return (await res.json()) as Record<string, string>;
}
