-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- Databases seeded before this column existed: flag the two seeded organizations
-- (src/database/seed.ts), so their one-click demo logins keep working.
UPDATE "organizations" SET "is_demo" = true WHERE "name" IN ('Northwind Facilities', 'Harbor Labs');
