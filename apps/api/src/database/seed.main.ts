import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { seedDemo } from './seed';

/** `pnpm db:seed` locally, `node dist/database/seed.main.js` in the container. */
async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env file: the environment is already set (Docker, CI).
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set.');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const seeded = await seedDemo(prisma);
    console.log(seeded ? '[seed] Demo organizations created.' : '[seed] Demo data already present; nothing to do.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed] Failed:', error);
  process.exit(1);
});
