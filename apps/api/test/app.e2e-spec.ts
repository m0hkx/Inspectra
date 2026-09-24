import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { apiErrorSchema, healthResponseSchema, type Inspection, type Issue, type WorkOrder } from '@inspectra/shared';
import type { PrismaClient } from '../src/generated/prisma/client';
import { TEST_DATABASE_URL } from './global-setup';

/**
 * Integration tests against a real Postgres (the docker-compose one, database
 * `inspectra_test`). They cover the guarantees the database and transactions make,
 * which mocks could not prove.
 */
describe('Inspectra API (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let ids: Awaited<ReturnType<typeof buildFixture>>;

  const as = (userId: string) => ({ 'x-user-id': userId });

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    delete process.env.REDIS_URL; // no queue in tests; generation is driven through the API

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/infrastructure/prisma/prisma.service.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService).unscoped;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE audit_events, work_orders, issues, inspection_responses, inspections, inspection_schedules, template_items, inspection_templates, assets, sites, memberships, users, organizations CASCADE',
    );
    ids = await buildFixture(prisma);
  });

  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function generate(userId = ids.a.admin): Promise<number> {
    const res = await http().post('/api/schedules/generate').set(as(userId)).expect(200);
    return res.body.created as number;
  }

  async function pendingInspection(): Promise<Inspection> {
    await generate();
    const res = await http().get('/api/inspections').set(as(ids.a.inspector)).expect(200);
    const inspection = (res.body as Inspection[]).find((i) => i.status === 'PENDING');
    if (!inspection) throw new Error('fixture produced no pending inspection');
    return inspection;
  }

  function answers(inspection: Inspection, fails: number) {
    return inspection.responses.map((r, i) => ({
      id: r.id,
      result: i < fails ? 'FAIL' : 'PASS',
      notes: i < fails ? 'Broken' : '',
      severity: r.severity,
    }));
  }

  it('GET /api/health is public and matches the shared contract', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  describe('tenancy', () => {
    it("returns 404 when an Org A user requests Org B's work order", async () => {
      const res = await http().get(`/api/work-orders/${ids.b.workOrder}`).set(as(ids.a.admin)).expect(404);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    });

    it("cannot change Org B's work order either", async () => {
      await http()
        .post(`/api/work-orders/${ids.b.workOrder}/transitions`)
        .set(as(ids.a.admin))
        .send({ to: 'CANCELLED' })
        .expect(404);
      const untouched = await prisma.workOrder.findUniqueOrThrow({ where: { id: ids.b.workOrder } });
      expect(untouched.status).toBe('OPEN');
    });

    it("lists only the caller's organization", async () => {
      const res = await http().get('/api/work-orders').set(as(ids.a.admin)).expect(200);
      expect((res.body as WorkOrder[]).map((w) => w.id)).not.toContain(ids.b.workOrder);
      const sites = await http().get('/api/sites').set(as(ids.b.admin)).expect(200);
      expect(sites.body).toHaveLength(1);
    });
  });

  describe('scheduled generation', () => {
    it('creates one inspection when run twice', async () => {
      expect(await generate()).toBe(1);
      expect(await generate()).toBe(0);
      expect(await prisma.inspection.count({ where: { scheduleId: ids.a.schedule } })).toBe(1);
    });

    it('snapshots template prompts so later edits do not rewrite history', async () => {
      const inspection = await pendingInspection();
      await http()
        .put(`/api/templates/${ids.a.template}`)
        .set(as(ids.a.admin))
        .send({ name: 'Renamed', description: '', items: [{ prompt: 'Something new', defaultSeverity: 'LOW' }] })
        .expect(200);
      const res = await http().get(`/api/inspections/${inspection.id}`).set(as(ids.a.inspector)).expect(200);
      expect((res.body as Inspection).responses.map((r) => r.itemPrompt)).toEqual(['Brakes hold', 'Horn works']);
    });
  });

  describe('inspection submit', () => {
    it('opens exactly one issue per failed item', async () => {
      const inspection = await pendingInspection();
      await http()
        .post(`/api/inspections/${inspection.id}/submit`)
        .set(as(ids.a.inspector))
        .send({ responses: answers(inspection, 2) })
        .expect(200);
      expect(await prisma.issue.count({ where: { inspectionId: inspection.id } })).toBe(2);
    });

    it('a retried submit is refused and still leaves exactly two issues', async () => {
      const inspection = await pendingInspection();
      const body = { responses: answers(inspection, 2) };
      await http().post(`/api/inspections/${inspection.id}/submit`).set(as(ids.a.inspector)).send(body).expect(200);
      const retry = await http().post(`/api/inspections/${inspection.id}/submit`).set(as(ids.a.inspector)).send(body).expect(409);
      expect(retry.body.error.code).toBe('INSPECTION_ALREADY_SUBMITTED');
      expect(await prisma.issue.count({ where: { inspectionId: inspection.id } })).toBe(2);
    });

    it('rolls everything back when the submit fails part-way', async () => {
      const inspection = await pendingInspection();
      const res = await http()
        .post(`/api/inspections/${inspection.id}/submit`)
        .set(as(ids.a.inspector))
        .send({ responses: answers(inspection, 1).slice(0, 1) })
        .expect(422);
      expect(res.body.error.code).toBe('INSPECTION_INCOMPLETE');
      const row = await prisma.inspection.findUniqueOrThrow({ where: { id: inspection.id } });
      expect(row.status).toBe('PENDING');
      expect(await prisma.issue.count({ where: { inspectionId: inspection.id } })).toBe(0);
    });
  });

  describe('work orders', () => {
    async function openWorkOrder(): Promise<{ workOrder: WorkOrder; issue: Issue }> {
      const inspection = await pendingInspection();
      await http()
        .post(`/api/inspections/${inspection.id}/submit`)
        .set(as(ids.a.inspector))
        .send({ responses: answers(inspection, 1) })
        .expect(200);
      const issue = (await http().get('/api/issues').set(as(ids.a.admin))).body.find((i: Issue) => i.inspectionId === inspection.id) as Issue;
      const res = await http()
        .post(`/api/issues/${issue.id}/work-orders`)
        .set(as(ids.a.admin))
        .send({ assigneeId: ids.a.tech, dueAt: new Date(Date.now() + 86_400_000).toISOString() })
        .expect(201);
      return { workOrder: res.body as WorkOrder, issue };
    }

    const move = (id: string, userId: string, to: string, reason?: string) =>
      http().post(`/api/work-orders/${id}/transitions`).set(as(userId)).send({ to, reason });

    it('rejects an invalid transition with a typed error', async () => {
      const { workOrder } = await openWorkOrder();
      const res = await move(workOrder.id, ids.a.admin, 'VERIFIED').expect(422);
      const body = apiErrorSchema.parse(res.body);
      expect(body.error.code).toBe('WORK_ORDER_INVALID_TRANSITION');
      expect(body.error.message).toBe('Cannot move from OPEN to VERIFIED.');
      expect(body.error.requestId).toMatch(/^req_/);
    });

    it("does not let a technician act on someone else's work order", async () => {
      const { workOrder } = await openWorkOrder();
      await move(workOrder.id, ids.a.tech2, 'IN_PROGRESS').expect(404);
    });

    it('resolves the issue when the work order is verified', async () => {
      const { workOrder, issue } = await openWorkOrder();
      await move(workOrder.id, ids.a.tech, 'IN_PROGRESS').expect(200);
      await move(workOrder.id, ids.a.tech, 'COMPLETED').expect(200);
      await move(workOrder.id, ids.a.inspector, 'VERIFIED').expect(200);
      const row = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
      expect(row.status).toBe('RESOLVED');
    });

    it('requires a reason to reject completed work, and records it', async () => {
      const { workOrder } = await openWorkOrder();
      await move(workOrder.id, ids.a.tech, 'IN_PROGRESS').expect(200);
      await move(workOrder.id, ids.a.tech, 'COMPLETED').expect(200);
      const missing = await move(workOrder.id, ids.a.inspector, 'IN_PROGRESS').expect(422);
      expect(missing.body.error.code).toBe('WORK_ORDER_REASON_REQUIRED');
      await move(workOrder.id, ids.a.inspector, 'IN_PROGRESS', 'Sign still flickers').expect(200);
      const events = await prisma.auditEvent.findMany({ where: { entityId: workOrder.id, action: 'REJECTED' } });
      expect(events[0]?.message).toContain('Sign still flickers');
    });
  });

  it('writes audit events in the same transaction as the change', async () => {
    const res = await http().post('/api/sites').set(as(ids.a.admin)).send({ name: 'Depot', timezone: 'UTC' }).expect(201);
    const events = await prisma.auditEvent.findMany({ where: { entityId: res.body.id } });
    expect(events.map((e) => e.action)).toEqual(['CREATED']);
    expect(events[0]?.actorId).toBe(ids.a.admin);
  });

  it('enforces role permissions from the shared map', async () => {
    const res = await http().post('/api/sites').set(as(ids.a.tech)).send({ name: 'Depot', timezone: 'UTC' }).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    await http().get('/api/inspections').set(as(ids.a.tech)).expect(403);
    await http().get('/api/sites').expect(401);
  });
});

/** Two organizations: A with one daily schedule, B with an open work order A must never see. */
async function buildFixture(prisma: PrismaClient) {
  const a = { org: randomUUID(), admin: randomUUID(), inspector: randomUUID(), tech: randomUUID(), tech2: randomUUID() };
  const b = { org: randomUUID(), admin: randomUUID() };
  const siteA = randomUUID();
  const assetA = randomUUID();
  const template = randomUUID();
  const schedule = randomUUID();

  await prisma.organization.createMany({ data: [{ id: a.org, name: 'Org A' }, { id: b.org, name: 'Org B' }] });
  await prisma.user.createMany({
    data: [
      { id: a.admin, name: 'Ada Admin', email: 'ada@a.test' },
      { id: a.inspector, name: 'Ian Inspector', email: 'ian@a.test' },
      { id: a.tech, name: 'Tia Tech', email: 'tia@a.test' },
      { id: a.tech2, name: 'Tom Tech', email: 'tom@a.test' },
      { id: b.admin, name: 'Bea Admin', email: 'bea@b.test' },
    ],
  });
  await prisma.membership.createMany({
    data: [
      { organizationId: a.org, userId: a.admin, role: 'ADMIN' },
      { organizationId: a.org, userId: a.inspector, role: 'INSPECTOR' },
      { organizationId: a.org, userId: a.tech, role: 'TECHNICIAN' },
      { organizationId: a.org, userId: a.tech2, role: 'TECHNICIAN' },
      { organizationId: b.org, userId: b.admin, role: 'ADMIN' },
    ],
  });
  await prisma.site.create({ data: { id: siteA, organizationId: a.org, name: 'Plant', timezone: 'Europe/London' } });
  await prisma.asset.create({ data: { id: assetA, organizationId: a.org, siteId: siteA, name: 'Forklift', category: 'Vehicles' } });
  await prisma.inspectionTemplate.create({ data: { id: template, organizationId: a.org, name: 'Pre-shift' } });
  await prisma.templateItem.createMany({
    data: [
      { organizationId: a.org, templateId: template, position: 0, prompt: 'Brakes hold', defaultSeverity: 'CRITICAL' },
      { organizationId: a.org, templateId: template, position: 1, prompt: 'Horn works', defaultSeverity: 'MEDIUM' },
    ],
  });
  await prisma.inspectionSchedule.create({
    data: { id: schedule, organizationId: a.org, templateId: template, assetId: assetA, frequency: 'DAILY', timeOfDay: '07:00', assigneeId: a.inspector },
  });

  // Org B: a full chain down to an open work order.
  const siteB = randomUUID();
  const assetB = randomUUID();
  const inspectionB = randomUUID();
  const responseB = randomUUID();
  const issueB = randomUUID();
  const workOrderB = randomUUID();
  await prisma.site.create({ data: { id: siteB, organizationId: b.org, name: 'Lab', timezone: 'UTC' } });
  await prisma.asset.create({ data: { id: assetB, organizationId: b.org, siteId: siteB, name: 'Hood', category: 'Lab' } });
  await prisma.inspection.create({
    data: { id: inspectionB, organizationId: b.org, number: 1, scheduleId: randomUUID(), assetId: assetB, assigneeId: b.admin, templateName: 'Lab check', dueAt: new Date(), status: 'SUBMITTED', submittedAt: new Date() },
  });
  await prisma.inspectionResponse.create({
    data: { id: responseB, organizationId: b.org, inspectionId: inspectionB, position: 0, itemPromptSnapshot: 'Airflow ok', result: 'FAIL', severity: 'HIGH' },
  });
  await prisma.issue.create({
    data: { id: issueB, organizationId: b.org, number: 1, inspectionResponseId: responseB, inspectionId: inspectionB, assetId: assetB, title: 'Airflow ok', severity: 'HIGH', status: 'IN_WORK' },
  });
  await prisma.workOrder.create({
    data: { id: workOrderB, organizationId: b.org, number: 1, issueId: issueB, assigneeId: b.admin, dueAt: new Date() },
  });

  return { a: { ...a, schedule, template }, b: { ...b, workOrder: workOrderB } };
}
