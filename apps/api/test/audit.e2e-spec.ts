import type { AuditEvent } from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import { flows } from './support/flows';

/** The activity log: ordering, filters, and what each role may read. */
describe('Audit log (integration)', () => {
  const t = useTestApp();
  const flow = flows(t);

  const events = async (userId: string, query = '') =>
    (await t.http().get(`/api/audit-events${query}`).set(as(userId)).expect(200))
      .body as AuditEvent[];

  it('returns the newest events first, in the shared shape', async () => {
    await t
      .http()
      .post('/api/sites')
      .set(as(t.ids.a.admin))
      .send({ name: 'First', timezone: 'UTC' })
      .expect(201);
    await t
      .http()
      .post('/api/sites')
      .set(as(t.ids.a.admin))
      .send({ name: 'Second', timezone: 'UTC' })
      .expect(201);
    const [latest, earlier] = await events(t.ids.a.admin);
    expect(latest).toEqual({
      id: expect.any(String),
      actorId: t.ids.a.admin,
      entityType: 'site',
      entityId: expect.any(String),
      action: 'CREATED',
      message: 'created site Second',
      createdAt: expect.stringMatching(/Z$/),
    });
    expect(earlier?.message).toBe('created site First');
  });

  it('filters by entity type and by entity id, and honours the limit', async () => {
    const { workOrder } = await flow.openWorkOrder();
    const byType = await events(t.ids.a.admin, '?entityType=work_order');
    expect(new Set(byType.map((e) => e.entityType))).toEqual(new Set(['work_order']));
    const byId = await events(t.ids.a.admin, `?entityId=${workOrder.id}`);
    expect(byId.map((e) => e.action).sort()).toEqual(['ASSIGNED', 'CREATED']);
    expect(await events(t.ids.a.admin, '?limit=1')).toHaveLength(1);
  });

  it('shows inspectors the whole organization log', async () => {
    await flow.openWorkOrder();
    const ids = async (userId: string) => (await events(userId)).map((e) => e.id).sort();
    expect(await ids(t.ids.a.inspector2)).toEqual(await ids(t.ids.a.admin));
  });

  it("shows technicians only their own work orders' history and the issues behind them", async () => {
    const { workOrder, issue } = await flow.openWorkOrder(t.ids.a.tech);
    await flow.move(workOrder.id, t.ids.a.tech, 'IN_PROGRESS').expect(200);

    const mine = await events(t.ids.a.tech);
    expect(mine.map((e) => `${e.entityType}:${e.action}`).sort()).toEqual(
      [
        'issue:CREATED',
        'work_order:ASSIGNED',
        'work_order:CREATED',
        'work_order:IN_PROGRESS',
      ].sort(),
    );
    expect(mine.every((e) => e.entityId === workOrder.id || e.entityId === issue.id)).toBe(true);
    expect(await events(t.ids.a.tech2)).toEqual([]);
  });

  it('keeps the technician scope when filters are added', async () => {
    await flow.openWorkOrder(t.ids.a.tech);
    const inspection = await t.prisma.inspection.findFirstOrThrow({
      where: { organizationId: t.ids.a.org },
    });
    expect(await events(t.ids.a.tech2, '?entityType=work_order')).toEqual([]);
    expect(await events(t.ids.a.tech, `?entityId=${inspection.id}`)).toEqual([]);
  });

  it('marks system actions with a null actor', async () => {
    await flow.generate();
    const [generated] = await events(t.ids.a.admin, '?entityType=inspection');
    expect(generated).toMatchObject({ action: 'GENERATED', actorId: null });
  });
});
