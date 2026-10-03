import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client';

export type Fixture = Awaited<ReturnType<typeof buildFixture>>;

/**
 * Two organizations.
 *
 * - Org A: every role (two inspectors, two technicians), one site/asset, a two-item
 *   template and one daily schedule for `inspector`. No inspections yet: tests
 *   generate them through the API.
 * - Org B: a full chain (submitted inspection → issue in work → open work order) plus
 *   a second, still open issue. Org A must never see or touch any of it.
 * - `loner`: a user with no membership anywhere.
 *
 * Every user has already linked a Clerk account whose id is their own id, so
 * `as(id)` signs in as them.
 */
export async function buildFixture(prisma: PrismaClient) {
  const a = {
    org: randomUUID(),
    admin: randomUUID(),
    inspector: randomUUID(),
    inspector2: randomUUID(),
    tech: randomUUID(),
    tech2: randomUUID(),
    site: randomUUID(),
    asset: randomUUID(),
    template: randomUUID(),
    schedule: randomUUID(),
  };
  const b = {
    org: randomUUID(),
    admin: randomUUID(),
    inspector: randomUUID(),
    tech: randomUUID(),
    site: randomUUID(),
    asset: randomUUID(),
    template: randomUUID(),
    schedule: randomUUID(),
    inspection: randomUUID(),
    response: randomUUID(),
    openResponse: randomUUID(),
    issue: randomUUID(),
    openIssue: randomUUID(),
    workOrder: randomUUID(),
  };
  const loner = randomUUID();

  await prisma.organization.createMany({
    data: [
      { id: a.org, name: 'Org A' },
      { id: b.org, name: 'Org B' },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: a.admin, name: 'Ada Admin', email: 'ada@a.test' },
      { id: a.inspector, name: 'Ian Inspector', email: 'ian@a.test' },
      { id: a.inspector2, name: 'Iris Inspector', email: 'iris@a.test' },
      { id: a.tech, name: 'Tia Tech', email: 'tia@a.test' },
      { id: a.tech2, name: 'Tom Tech', email: 'tom@a.test' },
      { id: b.admin, name: 'Bea Admin', email: 'bea@b.test' },
      { id: b.inspector, name: 'Ben Inspector', email: 'ben@b.test' },
      { id: b.tech, name: 'Bo Tech', email: 'bo@b.test' },
      { id: loner, name: 'Lou Loner', email: 'lou@nowhere.test' },
    ].map((user) => ({ ...user, externalId: user.id })),
  });
  // Explicit, increasing createdAt: list order and "first membership" are defined by it.
  const t0 = Date.now() - 60_000;
  const members: {
    organizationId: string;
    userId: string;
    role: 'ADMIN' | 'INSPECTOR' | 'TECHNICIAN';
  }[] = [
    { organizationId: a.org, userId: a.admin, role: 'ADMIN' },
    { organizationId: a.org, userId: a.inspector, role: 'INSPECTOR' },
    { organizationId: a.org, userId: a.inspector2, role: 'INSPECTOR' },
    { organizationId: a.org, userId: a.tech, role: 'TECHNICIAN' },
    { organizationId: a.org, userId: a.tech2, role: 'TECHNICIAN' },
    { organizationId: b.org, userId: b.admin, role: 'ADMIN' },
    { organizationId: b.org, userId: b.inspector, role: 'INSPECTOR' },
    { organizationId: b.org, userId: b.tech, role: 'TECHNICIAN' },
  ];
  await prisma.membership.createMany({
    data: members.map((m, i) => ({ ...m, createdAt: new Date(t0 + i * 1000) })),
  });

  await prisma.site.create({
    data: { id: a.site, organizationId: a.org, name: 'Plant', timezone: 'Europe/London' },
  });
  await prisma.asset.create({
    data: {
      id: a.asset,
      organizationId: a.org,
      siteId: a.site,
      name: 'Forklift',
      category: 'Vehicles',
    },
  });
  await prisma.inspectionTemplate.create({
    data: { id: a.template, organizationId: a.org, name: 'Pre-shift' },
  });
  await prisma.templateItem.createMany({
    data: [
      {
        organizationId: a.org,
        templateId: a.template,
        position: 0,
        prompt: 'Brakes hold',
        defaultSeverity: 'CRITICAL',
      },
      {
        organizationId: a.org,
        templateId: a.template,
        position: 1,
        prompt: 'Horn works',
        defaultSeverity: 'MEDIUM',
      },
    ],
  });
  await prisma.inspectionSchedule.create({
    data: {
      id: a.schedule,
      organizationId: a.org,
      templateId: a.template,
      assetId: a.asset,
      frequency: 'DAILY',
      timeOfDay: '07:00',
      assigneeId: a.inspector,
    },
  });

  await prisma.site.create({
    data: { id: b.site, organizationId: b.org, name: 'Lab', timezone: 'UTC' },
  });
  await prisma.asset.create({
    data: { id: b.asset, organizationId: b.org, siteId: b.site, name: 'Hood', category: 'Lab' },
  });
  await prisma.inspectionTemplate.create({
    data: { id: b.template, organizationId: b.org, name: 'Lab check' },
  });
  await prisma.templateItem.create({
    data: {
      organizationId: b.org,
      templateId: b.template,
      position: 0,
      prompt: 'Airflow ok',
      defaultSeverity: 'HIGH',
    },
  });
  await prisma.inspectionSchedule.create({
    data: {
      id: b.schedule,
      organizationId: b.org,
      templateId: b.template,
      assetId: b.asset,
      frequency: 'DAILY',
      timeOfDay: '09:00',
      assigneeId: b.inspector,
    },
  });
  await prisma.inspection.create({
    data: {
      id: b.inspection,
      organizationId: b.org,
      number: 1,
      scheduleId: b.schedule,
      assetId: b.asset,
      assigneeId: b.inspector,
      templateName: 'Lab check',
      dueAt: new Date(t0),
      status: 'SUBMITTED',
      submittedAt: new Date(t0),
    },
  });
  await prisma.inspectionResponse.createMany({
    data: [
      {
        id: b.response,
        organizationId: b.org,
        inspectionId: b.inspection,
        position: 0,
        itemPromptSnapshot: 'Airflow ok',
        result: 'FAIL',
        severity: 'HIGH',
      },
      {
        id: b.openResponse,
        organizationId: b.org,
        inspectionId: b.inspection,
        position: 1,
        itemPromptSnapshot: 'Sash closes',
        result: 'FAIL',
        severity: 'LOW',
      },
    ],
  });
  await prisma.issue.createMany({
    data: [
      {
        id: b.issue,
        organizationId: b.org,
        number: 1,
        inspectionResponseId: b.response,
        inspectionId: b.inspection,
        assetId: b.asset,
        title: 'Airflow ok',
        severity: 'HIGH',
        status: 'IN_WORK',
      },
      {
        id: b.openIssue,
        organizationId: b.org,
        number: 2,
        inspectionResponseId: b.openResponse,
        inspectionId: b.inspection,
        assetId: b.asset,
        title: 'Sash closes',
        severity: 'LOW',
        status: 'OPEN',
      },
    ],
  });
  await prisma.workOrder.create({
    data: {
      id: b.workOrder,
      organizationId: b.org,
      number: 1,
      issueId: b.issue,
      assigneeId: b.tech,
      dueAt: new Date(t0),
    },
  });
  await prisma.auditEvent.create({
    data: {
      organizationId: b.org,
      actorId: b.admin,
      entityType: 'work_order',
      entityId: b.workOrder,
      action: 'CREATED',
      message: 'created WO-1 from ISS-1',
    },
  });

  return { a, b, loner };
}

/** Every Org B row, for "nothing changed" assertions after cross-tenant attempts. */
export async function snapshotOrg(prisma: PrismaClient, organizationId: string) {
  const where = { organizationId };
  const [
    organization,
    memberships,
    sites,
    assets,
    templates,
    items,
    schedules,
    inspections,
    responses,
    issues,
    workOrders,
    audit,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId } }),
    prisma.membership.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.site.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.asset.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.inspectionTemplate.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.templateItem.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.inspectionSchedule.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.inspection.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.inspectionResponse.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.issue.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.workOrder.findMany({ where, orderBy: { id: 'asc' } }),
    prisma.auditEvent.findMany({ where, orderBy: { id: 'asc' } }),
  ]);
  return {
    organization,
    memberships,
    sites,
    assets,
    templates,
    items,
    schedules,
    inspections,
    responses,
    issues,
    workOrders,
    audit,
  };
}
