import { execSync } from 'node:child_process';
import { Client } from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://inspectra:inspectra@localhost:5432/inspectra_test';

/** Creates the test database if needed and applies migrations. Needs the docker-compose Postgres running. */
export default async function globalSetup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  try {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${database.replaceAll('"', '')}"`);
  } finally {
    await admin.end();
  }

  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
