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
