import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '../../generated/prisma/client.js';

const migrationsDir = join(__dirname, '../../../prisma/migrations');

/**
 * Spins up a throwaway SQLite file and replays every migration's SQL against
 * it directly (no `prisma migrate deploy` subprocess) — fast and
 * deterministic for tests, and stays correct as new migrations are added.
 */
export async function createTestDatabase(): Promise<{
  url: string;
  dir: string;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'rest-api-test-'));
  const url = `file:${join(dir, 'test.db')}`;

  const client = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    const sql = readFileSync(
      join(migrationsDir, migration, 'migration.sql'),
      'utf-8',
    );
    for (const statement of sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)) {
      await client.$executeRawUnsafe(statement);
    }
  }
  await client.$disconnect();

  return { url, dir };
}
