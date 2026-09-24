import { defineConfig } from 'prisma/config';

// Loaded by the Prisma CLI only (migrate, generate, studio). The running API reads
// DATABASE_URL through @nestjs/config and hands it to the pg driver adapter.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file (CI, Docker): the environment is already set.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // `prisma generate` doesn't connect, so an unset URL must not fail it (e.g. in Docker builds).
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/unused',
  },
});
