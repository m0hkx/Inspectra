import {
  allowedTransitions,
  apiErrorSchema,
  workOrderStatusSchema,
  type Issue,
  type Role,
  type WorkOrder,
  type WorkOrderStatus,
} from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import { flows } from './support/flows';

const STATUSES = workOrderStatusSchema.options;

/** Issues become work orders; work orders move through the shared state machine. */
describe('Issues and work orders (integration)', () => {
  const t = useTestApp();
  const flow = flows(t);

  const issueStatus = async (id: string) =>
    (await t.prisma.issue.findUniqueOrThrow({ where: { id } })).status;
  const listIssues = async (userId: string) =>
    ((await t.http().get('/api/issues').set(as(userId)).expect(200)).body as Issue[]).map(
      (i) => i.id,
    );
  const listWorkOrders = async (userId: string) =>
    ((await t.http().get('/api/work-orders').set(as(userId)).expect(200)).body as WorkOrder[]).map(
      (w) => w.id,
    );

  describe('creating a work order', () => {
    it('assigns a technician, numbers it and moves the issue into work', async () => {
      const issue = await flow.openIssue();
      const dueAt = '2030-06-01T12:00:00.000Z';
      const res = await t
        .http()
        .post(`/api/issues/${issue.id}/work-orders`)
        .set(as(t.ids.a.admin))
        .send({ assigneeId: t.ids.a.tech, dueAt })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        number: 101,
        issueId: issue.id,
        assigneeId: t.ids.a.tech,
        status: 'OPEN',
        dueAt,
        createdAt: expect.any(String),
      });
      expect(await issueStatus(issue.id)).toBe('IN_WORK');
      // Same transaction, so the two timestamps can tie: compare without order.
      const events = await t.prisma.auditEvent.findMany({ where: { entityId: res.body.id } });
      expect(events.map((e) => `${e.action}: ${e.message}`).sort()).toEqual([
        'ASSIGNED: assigned WO-101 to Tia Tech',
        'CREATED: created WO-101 from ISS-301',
      ]);
    });

    it.each([
      ['an inspector', (ids: typeof t.ids) => ids.a.inspector],
      ['an admin', (ids: typeof t.ids) => ids.a.admin],
      ['a user with no membership', (ids: typeof t.ids) => ids.loner],
    ])('refuses to assign it to %s', async (_label, assignee) => {
      const issue = await flow.openIssue();
      const res = await flow.createWorkOrder(issue.id, assignee(t.ids)).expect(422);
      expect(res.body.error.message).toBe(
        'Work orders must be assigned to a technician in this organization.',
      );
      expect(await issueStatus(issue.id)).toBe('OPEN');
    });

    it('refuses a second work order while the issue is in work', async () => {
      const { issue } = await flow.openWorkOrder();
      const res = await flow.createWorkOrder(issue.id).expect(409);
      expect(res.body.error.code).toBe('ISSUE_NOT_OPEN');
    });

    it('creates exactly one work order when several are requested at once', async () => {
      const issue = await flow.openIssue();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => flow.createWorkOrder(issue.id)),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 409, 409, 409, 409, 409,
      ]);
      expect(await t.prisma.workOrder.count({ where: { issueId: issue.id } })).toBe(1);
      const org = await t.prisma.organization.findUniqueOrThrow({ where: { id: t.ids.a.org } });
      expect(org.workOrderSeq).toBe(101);
    });

    it('returns 404 for an unknown issue', async () => {
      await flow.createWorkOrder('00000000-0000-4000-8000-000000000000').expect(404);
    });
  });

  describe('visibility', () => {
    it('shows technicians only their own work orders and the issues behind them', async () => {
      const { workOrder, issue } = await flow.openWorkOrder(t.ids.a.tech);
      expect(await listWorkOrders(t.ids.a.tech)).toEqual([workOrder.id]);
      expect(await listIssues(t.ids.a.tech)).toEqual([issue.id]);
      expect(await listWorkOrders(t.ids.a.tech2)).toEqual([]);
      expect(await listIssues(t.ids.a.tech2)).toEqual([]);
      await t.http().get(`/api/work-orders/${workOrder.id}`).set(as(t.ids.a.tech2)).expect(404);
    });

    it('shows inspectors and admins every work order and issue', async () => {
      const { workOrder, issue } = await flow.openWorkOrder();
      for (const userId of [t.ids.a.admin, t.ids.a.inspector, t.ids.a.inspector2]) {
        expect(await listWorkOrders(userId)).toEqual([workOrder.id]);
        expect(await listIssues(userId)).toEqual([issue.id]);
        await t.http().get(`/api/work-orders/${workOrder.id}`).set(as(userId)).expect(200);
      }
    });

    it('lists issues newest first', async () => {
      const inspection = await flow.pendingInspection();
      await flow.submit(inspection, 2);
      await t.prisma.issue.updateMany({
        where: { number: 301 },
        data: { createdAt: new Date(Date.now() - 60_000) },
      });
      const res = await t.http().get('/api/issues').set(as(t.ids.a.admin)).expect(200);
      expect((res.body as Issue[]).map((i) => i.number)).toEqual([302, 301]);
    });
  });

  describe('state machine', () => {
    it('matches the shared transition table for every status, target and actor', async () => {
      const { workOrder, issue } = await flow.openWorkOrder(t.ids.a.tech);
      const actors: { label: string; userId: string; role: Role }[] = [
        { label: 'admin', userId: t.ids.a.admin, role: 'ADMIN' },
        { label: 'inspector', userId: t.ids.a.inspector, role: 'INSPECTOR' },
        { label: 'assignee', userId: t.ids.a.tech, role: 'TECHNICIAN' },
      ];
      const wrong: string[] = [];
      for (const from of STATUSES) {
        for (const to of STATUSES) {
          for (const actor of actors) {
            await t.prisma.workOrder.update({
              where: { id: workOrder.id },
              data: { status: from },
            });
            await t.prisma.issue.update({ where: { id: issue.id }, data: { status: 'IN_WORK' } });
            const expected = allowedTransitions(from, actor, t.ids.a.tech).some((x) => x.to === to)
              ? 200
              : 422;
            const res = await flow.move(workOrder.id, actor.userId, to, 'Checked on site');
            if (res.status !== expected)
              wrong.push(`${actor.label}: ${from} → ${to} expected ${expected}, got ${res.status}`);
            if (expected === 422 && res.body?.error?.code !== 'WORK_ORDER_INVALID_TRANSITION')
              wrong.push(`${actor.label}: ${from} → ${to} wrong code`);
          }
        }
      }
      expect(wrong).toEqual([]);
    });

    it("hides another technician's work order entirely, whatever the move", async () => {
      const { workOrder } = await flow.openWorkOrder(t.ids.a.tech);
      for (const to of STATUSES) {
        await flow.move(workOrder.id, t.ids.a.tech2, to).expect(404);
      }
    });

    it('walks the happy path and resolves the issue on verification', async () => {
      const { workOrder, issue } = await flow.openWorkOrder();
      const path: [string, WorkOrderStatus][] = [
        [t.ids.a.tech, 'IN_PROGRESS'],
        [t.ids.a.tech, 'ON_HOLD'],
        [t.ids.a.tech, 'IN_PROGRESS'],
        [t.ids.a.tech, 'COMPLETED'],
        [t.ids.a.inspector, 'VERIFIED'],
      ];
      for (const [userId, to] of path) {
        const res = await flow.move(workOrder.id, userId, to).expect(200);
        expect(res.body.status).toBe(to);
        expect(await issueStatus(issue.id)).toBe(to === 'VERIFIED' ? 'RESOLVED' : 'IN_WORK');
      }
      const events = await t.prisma.auditEvent.findMany({
        where: { entityId: { in: [workOrder.id, issue.id] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(events.map((e) => `${e.entityType}:${e.action}`).sort()).toEqual(
        [
          'issue:CREATED',
          'work_order:CREATED',
          'work_order:ASSIGNED',
          'work_order:IN_PROGRESS',
          'work_order:ON_HOLD',
          'work_order:IN_PROGRESS',
          'work_order:COMPLETED',
          'work_order:VERIFIED',
          'issue:RESOLVED',
        ].sort(),
      );
      // Each move is its own request, so these are strictly ordered.
      const moves = events
        .filter((e) => ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'VERIFIED'].includes(e.action))
        .map((e) => e.action);
      expect(moves).toEqual(['IN_PROGRESS', 'ON_HOLD', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED']);
      const verified = events.find((e) => e.action === 'VERIFIED');
      expect(verified).toMatchObject({
        actorId: t.ids.a.inspector,
        message: 'moved WO-101 to VERIFIED',
        before: { status: 'COMPLETED' },
        after: { status: 'VERIFIED' },
      });
    });

    it.each(['OPEN', 'IN_PROGRESS', 'ON_HOLD'] as const)(
      'reopens the issue when an admin cancels from %s, so it can get a new work order',
      async (from) => {
        const { workOrder, issue } = await flow.openWorkOrder();
        await t.prisma.workOrder.update({ where: { id: workOrder.id }, data: { status: from } });
        await flow.move(workOrder.id, t.ids.a.admin, 'CANCELLED').expect(200);
        expect(await issueStatus(issue.id)).toBe('OPEN');
        const second = await flow.createWorkOrder(issue.id, t.ids.a.tech2).expect(201);
        expect(second.body.number).toBe(102);
      },
    );

    it.each(['VERIFIED', 'CANCELLED'] as const)('treats %s as final', async (final) => {
      const { workOrder } = await flow.openWorkOrder();
      await t.prisma.workOrder.update({ where: { id: workOrder.id }, data: { status: final } });
      for (const [userId, to] of [
        [t.ids.a.tech, 'IN_PROGRESS'],
        [t.ids.a.admin, 'CANCELLED'],
        [t.ids.a.inspector, 'VERIFIED'],
      ] as const) {
        await flow.move(workOrder.id, userId, to).expect(422);
      }
    });

    describe('rejecting completed work', () => {
      const completed = async () => {
        const opened = await flow.openWorkOrder();
        await flow.move(opened.workOrder.id, t.ids.a.tech, 'IN_PROGRESS').expect(200);
        await flow.move(opened.workOrder.id, t.ids.a.tech, 'COMPLETED').expect(200);
        return opened;
      };

      it.each([
        ['no reason', undefined],
        ['an empty reason', ''],
        ['a whitespace-only reason', '   \n\t'],
      ])('requires a reason: refuses %s', async (_label, reason) => {
        const { workOrder } = await completed();
        const res = await flow
          .move(workOrder.id, t.ids.a.inspector, 'IN_PROGRESS', reason)
          .expect(422);
        expect(apiErrorSchema.parse(res.body).error.code).toBe('WORK_ORDER_REASON_REQUIRED');
        expect(
          (await t.prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } })).status,
        ).toBe('COMPLETED');
      });

      it('sends the work back and records the trimmed reason', async () => {
        const { workOrder, issue } = await completed();
        await flow
          .move(workOrder.id, t.ids.a.admin, 'IN_PROGRESS', '  Sign still flickers  ')
          .expect(200);
        expect(await issueStatus(issue.id)).toBe('IN_WORK');
        const event = await t.prisma.auditEvent.findFirstOrThrow({
          where: { entityId: workOrder.id, action: 'REJECTED' },
        });
        expect(event).toMatchObject({
          actorId: t.ids.a.admin,
          message: 'rejected WO-101: "Sign still flickers"',
          before: { status: 'COMPLETED' },
          after: { status: 'IN_PROGRESS', reason: 'Sign still flickers' },
        });
      });
    });

    it('applies exactly one of several simultaneous moves', async () => {
      const { workOrder } = await flow.openWorkOrder();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => flow.move(workOrder.id, t.ids.a.tech, 'IN_PROGRESS')),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      // Losers either saw the old status and lost the update (409) or saw the new one (422).
      expect(statuses.filter((s) => s !== 200).every((s) => s === 409 || s === 422)).toBe(true);
      expect(
        await t.prisma.auditEvent.count({
          where: { entityId: workOrder.id, action: 'IN_PROGRESS' },
        }),
      ).toBe(1);
    });

    it('lets "complete" and "cancel" race without both winning', async () => {
      const { workOrder, issue } = await flow.openWorkOrder();
      await flow.move(workOrder.id, t.ids.a.tech, 'IN_PROGRESS').expect(200);
      const [done, cancelled] = await Promise.all([
        flow.move(workOrder.id, t.ids.a.tech, 'COMPLETED'),
        flow.move(workOrder.id, t.ids.a.admin, 'CANCELLED'),
      ]);
      expect([done.status, cancelled.status].filter((s) => s === 200)).toHaveLength(1);
      const final = await t.prisma.workOrder.findUniqueOrThrow({ where: { id: workOrder.id } });
      expect(await issueStatus(issue.id)).toBe(final.status === 'CANCELLED' ? 'OPEN' : 'IN_WORK');
    });
  });
});
