-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'INSPECTOR', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ResponseResult" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_WORK', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "inspection_seq" INTEGER NOT NULL DEFAULT 1000,
    "issue_seq" INTEGER NOT NULL DEFAULT 300,
    "work_order_seq" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "timezone" TEXT NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "serial" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "default_severity" "Severity" NOT NULL,

    CONSTRAINT "template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_schedules" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "time_of_day" TEXT NOT NULL,
    "assignee_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "schedule_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "template_name" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_responses" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "item_prompt_snapshot" TEXT NOT NULL,
    "result" "ResponseResult",
    "notes" TEXT NOT NULL DEFAULT '',
    "severity" "Severity" NOT NULL,

    CONSTRAINT "inspection_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "inspection_response_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "severity" "Severity" NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "issue_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_organization_id_user_id_key" ON "memberships"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "sites_organization_id_idx" ON "sites"("organization_id");

-- CreateIndex
CREATE INDEX "assets_organization_id_site_id_idx" ON "assets"("organization_id", "site_id");

-- CreateIndex
CREATE INDEX "inspection_templates_organization_id_idx" ON "inspection_templates"("organization_id");

-- CreateIndex
CREATE INDEX "template_items_template_id_position_idx" ON "template_items"("template_id", "position");

-- CreateIndex
CREATE INDEX "inspection_schedules_organization_id_active_idx" ON "inspection_schedules"("organization_id", "active");

-- CreateIndex
CREATE INDEX "inspections_organization_id_status_due_at_idx" ON "inspections"("organization_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_schedule_id_due_at_key" ON "inspections"("schedule_id", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_organization_id_number_key" ON "inspections"("organization_id", "number");

-- CreateIndex
CREATE INDEX "inspection_responses_inspection_id_position_idx" ON "inspection_responses"("inspection_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "issues_inspection_response_id_key" ON "issues"("inspection_response_id");

-- CreateIndex
CREATE INDEX "issues_organization_id_status_idx" ON "issues"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "issues_organization_id_number_key" ON "issues"("organization_id", "number");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_status_idx" ON "work_orders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "work_orders_organization_id_assignee_id_idx" ON "work_orders"("organization_id", "assignee_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_organization_id_number_key" ON "work_orders"("organization_id", "number");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_created_at_idx" ON "audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_entity_type_entity_id_idx" ON "audit_events"("organization_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "inspection_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_responses" ADD CONSTRAINT "inspection_responses_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
