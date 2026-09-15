import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateApiKey(): string {
  return randomBytes(24).toString('base64url');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function matchesApiKey(
  providedKey: string,
  expectedHash: string,
): boolean {
  const provided = Buffer.from(hashApiKey(providedKey));
  const expected = Buffer.from(expectedHash);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
