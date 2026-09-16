import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Local, per-machine persistence for keys learned via `register_app`, so a
 * self-served key survives a server restart without the user re-registering
 * or editing env vars by hand.
 */
export function readPersistedKeys(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function persistKey(
  filePath: string,
  appId: string,
  apiKey: string,
): void {
  const keys = readPersistedKeys(filePath);
  keys[appId] = apiKey;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(keys, null, 2) + '\n');
}

export function removeKey(filePath: string, appId: string): void {
  const keys = readPersistedKeys(filePath);
  if (!(appId in keys)) {
    return;
  }
  delete keys[appId];
  writeFileSync(filePath, JSON.stringify(keys, null, 2) + '\n');
}

/**
 * Where register_app/delete_app persist a key across the lifetime of one
 * "identity" — a local stdio process (LocalFileKeyStore) or, over HTTP, one
 * authenticated user's account on the REST API (see rest-key-store.ts).
 */
export interface KeyStore {
  persist(appId: string, apiKey: string): void | Promise<void>;
  remove(appId: string): void | Promise<void>;
  get(appId: string): string | undefined | Promise<string | undefined>;
}

export class LocalFileKeyStore implements KeyStore {
  constructor(private readonly filePath: string) {}

  persist(appId: string, apiKey: string): void {
    persistKey(this.filePath, appId, apiKey);
  }

  remove(appId: string): void {
    removeKey(this.filePath, appId);
  }

  get(appId: string): string | undefined {
    return readPersistedKeys(this.filePath)[appId];
  }
}
