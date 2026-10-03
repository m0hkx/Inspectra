import { randomUUID } from 'node:crypto';
import { nextDueAt, type Inspection, type Schedule } from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import { flows } from './support/flows';

/** Schedules and the generation that turns them into inspections. */
describe('Schedules and generation (integration)', () => {
  const t = useTestApp();
  const flow = flows(t);
  const admin = () => as(t.ids.a.admin);

  const schedule = (overrides: Record<string, unknown> = {}) => ({
    templateId: t.ids.a.template,
    assetId: t.ids.a.asset,
    frequency: 'WEEKLY',
    timeOfDay: '10:30',
    assigneeId: t.ids.a.inspector2,
    ...overrides,
  });

  describe('creating', () => {
    it('creates an active schedule and audits it', async () => {
      const res = await t.http().post('/api/schedules').set(admin()).send(schedule()).expect(201);
      expect(res.body).toEqual({ id: expect.any(String), ...schedule(), active: true });
      const event = await t.prisma.auditEvent.findFirstOrThrow({
        where: { entityId: res.body.id },
      });
      expect(event).toMatchObject({
        action: 'CREATED',
        message: 'scheduled Pre-shift for Forklift',
      });
    });

    it.each([
      ['a technician', (ids: typeof t.ids) => ids.a.tech],
      ['an admin', (ids: typeof t.ids) => ids.a.admin],
      ['someone unknown', () => randomUUID()],
      ['an inspector of another organization', (ids: typeof t.ids) => ids.b.inspector],
    ])('refuses to assign the schedule to %s', async (_label, assignee) => {
      const res = await t
        .http()
        .post('/api/schedules')
        .set(admin())
        .send(schedule({ assigneeId: assignee(t.ids) }))
        .expect(422);
      expect(res.body.error.message).toBe(
        'Schedules must be assigned to an inspector in this organization.',
      );
    });

    it.each([
      ['template', { templateId: randomUUID() }, 'Choose a template from this organization.'],
      ['asset', { assetId: randomUUID() }, 'Choose an asset from this organization.'],
    ])('refuses an unknown %s', async (_label, overrides, message) => {
      const res = await t
        .http()
        .post('/api/schedules')
        .set(admin())
        .send(schedule(overrides))
        .expect(422);
      expect(res.body.error.message).toBe(message);
      expect(
        await t.prisma.inspectionSchedule.count({ where: { organizationId: t.ids.a.org } }),
      ).toBe(1);
    });

    it('lists schedules oldest first', async () => {
      const created = (
        await t.http().post('/api/schedules').set(admin()).send(schedule()).expect(201)
      ).body as Schedule;
      const res = await t.http().get('/api/schedules').set(as(t.ids.a.tech)).expect(200);
      expect((res.body as Schedule[]).map((s) => s.id)).toEqual([t.ids.a.schedule, created.id]);
    });
  });

  describe('pausing', () => {
    it('pauses and resumes, auditing each change', async () => {
      await t
        .http()
        .patch(`/api/schedules/${t.ids.a.schedule}`)
        .set(admin())
        .send({ active: false })
        .expect(200);
      const res = await t
        .http()
        .patch(`/api/schedules/${t.ids.a.schedule}`)
        .set(admin())
        .send({ active: true })
        .expect(200);
      expect(res.body.active).toBe(true);
      const events = await t.prisma.auditEvent.findMany({
        where: { entityId: t.ids.a.schedule },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => [e.action, e.message])).toEqual([
        ['PAUSED', 'paused a schedule'],
        ['ACTIVATED', 'resumed a schedule'],
      ]);
    });

    it('does not generate from a paused schedule', async () => {
      await t
        .http()
        .patch(`/api/schedules/${t.ids.a.schedule}`)
        .set(admin())
        .send({ active: false })
        .expect(200);
      expect(await flow.generate()).toBe(0);
      await t
        .http()
        .patch(`/api/schedules/${t.ids.a.schedule}`)
        .set(admin())
        .send({ active: true })
        .expect(200);
      expect(await flow.generate()).toBe(1);
    });

    it('returns 404 for an unknown schedule', async () => {
      await t
        .http()
        .patch(`/api/schedules/${randomUUID()}`)
        .set(admin())
        .send({ active: false })
        .expect(404);
    });
  });

  describe('deleting', () => {
    it('deletes the schedule and audits it, keeping the inspections it created', async () => {
      expect(await flow.generate()).toBe(1);
      await t.http().delete(`/api/schedules/${t.ids.a.schedule}`).set(admin()).expect(204);

      const res = await t.http().get('/api/schedules').set(admin()).expect(200);
      expect((res.body as Schedule[]).map((s) => s.id)).not.toContain(t.ids.a.schedule);
      expect(await t.prisma.inspection.count({ where: { scheduleId: t.ids.a.schedule } })).toBe(1);
      const event = await t.prisma.auditEvent.findFirstOrThrow({
        where: { entityId: t.ids.a.schedule, action: 'DELETED' },
      });
      expect(event).toMatchObject({
        actorId: t.ids.a.admin,
        entityType: 'schedule',
        message: 'deleted the Pre-shift schedule for Forklift',
        before: expect.objectContaining({ id: t.ids.a.schedule, active: true }),
      });
    });

    it('generates nothing from a deleted schedule', async () => {
      await t.http().delete(`/api/schedules/${t.ids.a.schedule}`).set(admin()).expect(204);
      expect(await flow.generate()).toBe(0);
      expect(await t.prisma.inspection.count({ where: { scheduleId: t.ids.a.schedule } })).toBe(0);
    });

    it('returns 404 for an unknown or already deleted schedule', async () => {
      await t.http().delete(`/api/schedules/${randomUUID()}`).set(admin()).expect(404);
      await t.http().delete(`/api/schedules/${t.ids.a.schedule}`).set(admin()).expect(204);
      await t.http().delete(`/api/schedules/${t.ids.a.schedule}`).set(admin()).expect(404);
    });
  });

  describe('generation', () => {
    it("creates today's inspection in the site's timezone, snapshotting the template", async () => {
      const before = new Date();
      expect(await flow.generate()).toBe(1);
      const [row] = await t.prisma.inspection.findMany({
        where: { scheduleId: t.ids.a.schedule },
        include: { responses: { orderBy: { position: 'asc' } } },
      });
      expect(row).toMatchObject({
        number: 1001,
        templateName: 'Pre-shift',
        assigneeId: t.ids.a.inspector,
        assetId: t.ids.a.asset,
        status: 'PENDING',
        submittedAt: null,
      });
      expect(row?.dueAt).toEqual(nextDueAt('DAILY', '07:00', 'Europe/London', before));
      expect(
        row?.responses.map((r) => [r.position, r.itemPromptSnapshot, r.severity, r.result]),
      ).toEqual([
        [0, 'Brakes hold', 'CRITICAL', null],
        [1, 'Horn works', 'MEDIUM', null],
      ]);
    });

    it('keeps the snapshot when the template is edited later', async () => {
      const inspection = await flow.pendingInspection();
      await t
        .http()
        .put(`/api/templates/${t.ids.a.template}`)
        .set(as(t.ids.a.admin))
        .send({
          name: 'Renamed',
          description: '',
          items: [{ prompt: 'Something new', defaultSeverity: 'LOW' }],
        })
        .expect(200);
      const res = await t
        .http()
        .get(`/api/inspections/${inspection.id}`)
        .set(as(t.ids.a.inspector))
        .expect(200);
      expect((res.body as Inspection).responses.map((r) => r.itemPrompt)).toEqual([
        'Brakes hold',
        'Horn works',
      ]);
    });

    it('records generation as a system action (no actor)', async () => {
      await flow.generate();
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { action: 'GENERATED' } });
      expect(event).toMatchObject({
        actorId: null,
        entityType: 'inspection',
        message: 'INS-1001 generated from schedule (Pre-shift, Forklift)',
      });
    });

    it('is idempotent: running again creates nothing', async () => {
      expect(await flow.generate()).toBe(1);
      expect(await flow.generate()).toBe(0);
      expect(await flow.generate()).toBe(0);
      expect(await t.prisma.inspection.count({ where: { organizationId: t.ids.a.org } })).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { action: 'GENERATED' } })).toBe(1);
    });

    it('creates each inspection exactly once when runs race', async () => {
      await flow.addSchedule(t.ids.a.inspector2, '09:00');
      const results = await Promise.all(
        Array.from({ length: 6 }, () => t.http().post('/api/schedules/generate').set(admin())),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(200));
      expect(results.reduce((sum, r) => sum + (r.body.created as number), 0)).toBe(2);
      const rows = await t.prisma.inspection.findMany({
        where: { organizationId: t.ids.a.org },
        orderBy: { number: 'asc' },
      });
      expect(rows).toHaveLength(2);
      // Losers roll back their number too: no gaps, no duplicates.
      expect(rows.map((r) => r.number)).toEqual([1001, 1002]);
    });

    it('numbers inspections sequentially across schedules', async () => {
      await flow.addSchedule(t.ids.a.inspector2, '09:00');
      await flow.addSchedule(t.ids.a.inspector, '11:00');
      expect(await flow.generate()).toBe(3);
      const numbers = (
        await t.prisma.inspection.findMany({
          where: { organizationId: t.ids.a.org },
          orderBy: { number: 'asc' },
        })
      ).map((r) => r.number);
      expect(numbers).toEqual([1001, 1002, 1003]);
      const org = await t.prisma.organization.findUniqueOrThrow({ where: { id: t.ids.a.org } });
      expect(org.inspectionSeq).toBe(1003);
    });

    it('skips a schedule whose asset was removed', async () => {
      await t.prisma.inspectionSchedule.update({
        where: { id: t.ids.a.schedule },
        data: { assetId: randomUUID() },
      });
      expect(await flow.generate()).toBe(0);
    });

    it('computes weekly and monthly due dates in the site timezone', async () => {
      await t.prisma.site.update({
        where: { id: t.ids.a.site },
        data: { timezone: 'Pacific/Auckland' },
      });
      const weekly = await flow.addSchedule(t.ids.a.inspector2, '06:15');
      await t.prisma.inspectionSchedule.update({
        where: { id: weekly },
        data: { frequency: 'WEEKLY' },
      });
      const monthly = await flow.addSchedule(t.ids.a.inspector2, '23:45');
      await t.prisma.inspectionSchedule.update({
        where: { id: monthly },
        data: { frequency: 'MONTHLY' },
      });

      const now = new Date();
      await flow.generate();
      const due = async (scheduleId: string) =>
        (await t.prisma.inspection.findFirstOrThrow({ where: { scheduleId } })).dueAt;
      expect(await due(weekly)).toEqual(nextDueAt('WEEKLY', '06:15', 'Pacific/Auckland', now));
      expect(await due(monthly)).toEqual(nextDueAt('MONTHLY', '23:45', 'Pacific/Auckland', now));
    });

    it('shows each inspector only their own generated inspections', async () => {
      await flow.addSchedule(t.ids.a.inspector2, '09:00');
      await flow.generate();
      const mine = async (userId: string) =>
        (
          (await t.http().get('/api/inspections').set(as(userId)).expect(200)).body as Inspection[]
        ).map((i) => i.assigneeId);
      expect(await mine(t.ids.a.inspector)).toEqual([t.ids.a.inspector]);
      expect(await mine(t.ids.a.inspector2)).toEqual([t.ids.a.inspector2]);
      expect((await mine(t.ids.a.admin)).sort()).toEqual(
        [t.ids.a.inspector, t.ids.a.inspector2].sort(),
      );
    });
  });
});
