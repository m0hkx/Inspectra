import type { PrismaClient } from '../../src/generated/prisma/client';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://inspectra:inspectra@localhost:5432/inspectra_test';

const TABLES = [
  'audit_events',
  'work_orders',
  'issues',
  'inspection_responses',
  'inspections',
  'inspection_schedules',
  'template_items',
  'inspection_templates',
  'assets',
  'sites',
  'memberships',
  'users',
  'organizations',
];

/** Empties every table, so each test starts from its own fixture. */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.join(', ')} CASCADE`);
}
