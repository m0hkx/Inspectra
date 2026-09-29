import type { Inspection, Me, WorkOrder } from '@inspectra/shared';
import { DEMO_ORG_NAME, seedDemo } from '../src/database/seed';
import { as, useTestApp } from './support/app';

/** The demo data the Docker image seeds on first start must be valid for the API itself. */
describe('Demo seed (integration)', () => {
  const t = useTestApp();

  const demoAdmin = async () => {
    const org = await t.prisma.organization.findFirstOrThrow({ where: { name: DEMO_ORG_NAME } });
    return t.prisma.membership.findFirstOrThrow({
      where: { organizationId: org.id, role: 'ADMIN' },
    });
  };

  it('seeds once and is a no-op afterwards', async () => {
    expect(await seedDemo(t.prisma)).toBe(true);
    const counts = async () =>
      Promise.all([
        t.prisma.organization.count(),
        t.prisma.inspection.count(),
        t.prisma.auditEvent.count(),
      ]);
    const after = await counts();
    expect(await seedDemo(t.prisma)).toBe(false);
    expect(await counts()).toEqual(after);
  });

  it('produces an organization the API can serve', async () => {
    await seedDemo(t.prisma);
    const admin = await demoAdmin();
    const me = (await t.http().get('/api/me').set(as(admin.userId)).expect(200)).body as Me;
    expect(me.organization.name).toBe(DEMO_ORG_NAME);

    const inspections = (await t.http().get('/api/inspections').set(as(admin.userId)).expect(200))
      .body as Inspection[];
    expect(inspections.length).toBeGreaterThan(0);
    expect(new Set(inspections.map((i) => i.number)).size).toBe(inspections.length);
    const workOrders = (await t.http().get('/api/work-orders').set(as(admin.userId)).expect(200))
      .body as WorkOrder[];
    expect(workOrders.length).toBeGreaterThan(0);
  });

  it('keeps the numbering sequences ahead of the seeded records', async () => {
    await seedDemo(t.prisma);
    const org = await t.prisma.organization.findFirstOrThrow({ where: { name: DEMO_ORG_NAME } });
    const where = { organizationId: org.id };
    const [inspections, issues, workOrders] = await Promise.all([
      t.prisma.inspection.aggregate({ where, _max: { number: true } }),
      t.prisma.issue.aggregate({ where, _max: { number: true } }),
      t.prisma.workOrder.aggregate({ where, _max: { number: true } }),
    ]);
    // Otherwise the next generated/created record collides with a seeded number.
    expect(org.inspectionSeq).toBeGreaterThanOrEqual(inspections._max.number ?? 0);
    expect(org.issueSeq).toBeGreaterThanOrEqual(issues._max.number ?? 0);
    expect(org.workOrderSeq).toBeGreaterThanOrEqual(workOrders._max.number ?? 0);
  });

  it("does not duplicate today's seeded inspections when generation runs", async () => {
    await seedDemo(t.prisma);
    const admin = await demoAdmin();
    const first = await t.http().post('/api/schedules/generate').set(as(admin.userId)).expect(200);
    const second = await t.http().post('/api/schedules/generate').set(as(admin.userId)).expect(200);
    expect(second.body.created).toBe(0);
    expect(first.body.created).toBeGreaterThanOrEqual(0);
  });
});
