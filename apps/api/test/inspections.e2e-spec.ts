import { randomUUID } from 'node:crypto';
import { apiErrorSchema, type Inspection, type Issue } from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import { flows } from './support/flows';

/** Doing an inspection: who sees it, what a submit must contain, and what it produces. */
describe('Inspections (integration)', () => {
  const t = useTestApp();
  const flow = flows(t);

  const submitAs = (userId: string, inspection: Inspection, responses: object[]) =>
    t.http().post(`/api/inspections/${inspection.id}/submit`).set(as(userId)).send({ responses });

  describe('visibility', () => {
    it('shows an inspection to its assignee and to admins, as 404 to another inspector', async () => {
      const inspection = await flow.pendingInspection();
      await t
        .http()
        .get(`/api/inspections/${inspection.id}`)
        .set(as(t.ids.a.inspector))
        .expect(200);
      await t.http().get(`/api/inspections/${inspection.id}`).set(as(t.ids.a.admin)).expect(200);
      await t
        .http()
        .get(`/api/inspections/${inspection.id}`)
        .set(as(t.ids.a.inspector2))
        .expect(404);
    });

    it('refuses technicians outright', async () => {
      const inspection = await flow.pendingInspection();
      const res = await t
        .http()
        .get(`/api/inspections/${inspection.id}`)
        .set(as(t.ids.a.tech))
        .expect(403);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('FORBIDDEN');
    });

    it('lists by due date, soonest first', async () => {
      await flow.addSchedule(t.ids.a.inspector, '05:00');
      await flow.addSchedule(t.ids.a.inspector, '22:00');
      await flow.generate();
      const res = await t.http().get('/api/inspections').set(as(t.ids.a.inspector)).expect(200);
      const due = (res.body as Inspection[]).map((i) => i.dueAt);
      expect(due).toHaveLength(3);
      expect(due).toEqual([...due].sort());
    });
  });

  describe('submitting', () => {
    it('saves every answer, marks the inspection submitted and opens one issue per FAIL', async () => {
      const inspection = await flow.pendingInspection();
      const [brakes, horn] = inspection.responses;
      const before = Date.now();
      const res = await submitAs(t.ids.a.inspector, inspection, [
        { id: brakes!.id, result: 'FAIL', notes: '  Pedal sinks  ', severity: 'HIGH' },
        { id: horn!.id, result: 'NA', severity: 'LOW' },
      ]).expect(200);

      const saved = res.body as Inspection;
      expect(saved.status).toBe('SUBMITTED');
      expect(new Date(saved.submittedAt!).getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(saved.responses).toEqual([
        {
          id: brakes!.id,
          itemPrompt: 'Brakes hold',
          result: 'FAIL',
          notes: 'Pedal sinks',
          severity: 'HIGH',
        },
        { id: horn!.id, itemPrompt: 'Horn works', result: 'NA', notes: '', severity: 'LOW' },
      ]);

      const issues = await flow.issuesOf(inspection.id);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject<Partial<Issue>>({
        number: 301,
        title: 'Brakes hold',
        notes: 'Pedal sinks',
        severity: 'HIGH', // the inspector's call, not the template default (CRITICAL)
        status: 'OPEN',
        responseId: brakes!.id,
        assetId: t.ids.a.asset,
      });
    });

    it('opens no issue when nothing failed', async () => {
      const inspection = await flow.pendingInspection();
      await flow.submit(inspection, 0);
      expect(await flow.issuesOf(inspection.id)).toEqual([]);
    });

    it('audits the submit and every issue it opens', async () => {
      const inspection = await flow.pendingInspection();
      await flow.submit(inspection, 2);
      // One transaction: timestamps can tie, so compare without order.
      const events = await t.prisma.auditEvent.findMany({ where: { actorId: t.ids.a.inspector } });
      expect(events.map((e) => `${e.entityType} ${e.action}: ${e.message}`).sort()).toEqual([
        'inspection SUBMITTED: submitted INS-1001 (2 items failed)',
        'issue CREATED: ISS-301 created (Pre-shift, item 1 failed)',
        'issue CREATED: ISS-302 created (Pre-shift, item 2 failed)',
      ]);
    });

    it('says "1 item" for a single failure', async () => {
      const inspection = await flow.pendingInspection();
      await flow.submit(inspection, 1);
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { action: 'SUBMITTED' } });
      expect(event.message).toBe('submitted INS-1001 (1 item failed)');
    });

    it.each([
      ['a missing item', (i: Inspection) => flow.answers(i, 0).slice(0, 1)],
      [
        'the same item twice instead of both',
        (i: Inspection) => [flow.answers(i, 0)[0], flow.answers(i, 0)[0]],
      ],
      [
        'an item from another inspection',
        (i: Inspection) => [
          ...flow.answers(i, 0),
          { id: randomUUID(), result: 'PASS', severity: 'LOW' },
        ],
      ],
    ])('refuses a submit with %s and changes nothing', async (_label, build) => {
      const inspection = await flow.pendingInspection();
      const res = await submitAs(
        t.ids.a.inspector,
        inspection,
        build(inspection) as object[],
      ).expect(422);
      expect(res.body.error).toMatchObject({
        code: 'INSPECTION_INCOMPLETE',
        message: 'Answer every item on this checklist before submitting.',
      });
      const row = await t.prisma.inspection.findUniqueOrThrow({
        where: { id: inspection.id },
        include: { responses: true },
      });
      expect(row.status).toBe('PENDING');
      expect(row.responses.every((r) => r.result === null)).toBe(true);
    });

    it("refuses another inspector's inspection as not found", async () => {
      const inspection = await flow.pendingInspection();
      await submitAs(t.ids.a.inspector2, inspection, flow.answers(inspection, 1)).expect(404);
    });

    it('follows the assignee when an inspection is reassigned', async () => {
      const inspection = await flow.pendingInspection();
      await t.prisma.inspection.update({
        where: { id: inspection.id },
        data: { assigneeId: t.ids.a.inspector2 },
      });
      await submitAs(t.ids.a.inspector, inspection, flow.answers(inspection, 0)).expect(404);
      await submitAs(t.ids.a.inspector2, inspection, flow.answers(inspection, 0)).expect(200);
    });

    it('refuses a second submit and keeps the first result', async () => {
      const inspection = await flow.pendingInspection();
      await flow.submit(inspection, 2);
      const retry = await submitAs(
        t.ids.a.inspector,
        inspection,
        flow.answers(inspection, 0),
      ).expect(409);
      expect(retry.body.error.code).toBe('INSPECTION_ALREADY_SUBMITTED');
      expect(await t.prisma.issue.count({ where: { inspectionId: inspection.id } })).toBe(2);
      const results = await t.prisma.inspectionResponse.findMany({
        where: { inspectionId: inspection.id },
        orderBy: { position: 'asc' },
      });
      expect(results.map((r) => r.result)).toEqual(['FAIL', 'FAIL']);
    });
  });

  describe('under concurrency', () => {
    it('accepts exactly one of several simultaneous submits', async () => {
      const inspection = await flow.pendingInspection();
      const body = { responses: flow.answers(inspection, 2) };
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          t
            .http()
            .post(`/api/inspections/${inspection.id}/submit`)
            .set(as(t.ids.a.inspector))
            .send(body),
        ),
      );
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409, 409, 409, 409, 409]);
      for (const r of results.filter((x) => x.status === 409))
        expect(r.body.error.code).toBe('INSPECTION_ALREADY_SUBMITTED');
      expect(await t.prisma.issue.count({ where: { inspectionId: inspection.id } })).toBe(2);
      expect(
        await t.prisma.auditEvent.count({
          where: { entityId: inspection.id, action: 'SUBMITTED' },
        }),
      ).toBe(1);
    });

    it('hands out unique, gap-free issue numbers to simultaneous submits', async () => {
      await flow.addSchedule(t.ids.a.inspector, '08:00');
      await flow.addSchedule(t.ids.a.inspector, '09:00');
      await flow.generate();
      const pending = (
        (await t.http().get('/api/inspections').set(as(t.ids.a.inspector)).expect(200))
          .body as Inspection[]
      ).filter((i) => i.status === 'PENDING');
      expect(pending).toHaveLength(3);

      await Promise.all(pending.map((i) => flow.submit(i, 2)));

      const numbers = (
        await t.prisma.issue.findMany({
          where: { organizationId: t.ids.a.org },
          orderBy: { number: 'asc' },
        })
      ).map((i) => i.number);
      expect(numbers).toEqual([301, 302, 303, 304, 305, 306]);
    });
  });
});
