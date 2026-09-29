import type {
  AuditEvent,
  Inspection,
  Issue,
  Member,
  Schedule,
  Site,
  Template,
  WorkOrder,
} from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import { snapshotOrg, type Fixture } from './support/fixture';
import { flows } from './support/flows';

interface Attempt {
  label: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  url: (ids: Fixture) => string;
  body?: (ids: Fixture) => object;
  /** Org A caller. */
  as: (ids: Fixture) => string;
  status: number;
}

/**
 * Org A users aiming at Org B's records. A foreign id must look exactly like a
 * missing one (404, or 422 when it is a reference inside a body), never 403, so ids
 * leak nothing, and Org B's rows must come out byte-for-byte unchanged.
 */
const ATTEMPTS: Attempt[] = [
  {
    label: 'read an asset',
    method: 'get',
    url: (i) => `/api/assets/${i.b.asset}`,
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'update an asset',
    method: 'patch',
    url: (i) => `/api/assets/${i.b.asset}`,
    body: (i) => ({ siteId: i.a.site, name: 'Mine now', category: 'X' }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'update a site',
    method: 'patch',
    url: (i) => `/api/sites/${i.b.site}`,
    body: () => ({ name: 'Mine now', timezone: 'UTC' }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'replace a template',
    method: 'put',
    url: (i) => `/api/templates/${i.b.template}`,
    body: () => ({ name: 'Mine', items: [{ prompt: 'p', defaultSeverity: 'LOW' }] }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'pause a schedule',
    method: 'patch',
    url: (i) => `/api/schedules/${i.b.schedule}`,
    body: () => ({ active: false }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'delete a schedule',
    method: 'delete',
    url: (i) => `/api/schedules/${i.b.schedule}`,
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'read an inspection',
    method: 'get',
    url: (i) => `/api/inspections/${i.b.inspection}`,
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'submit an inspection',
    method: 'post',
    url: (i) => `/api/inspections/${i.b.inspection}/submit`,
    body: (i) => ({ responses: [{ id: i.b.response, result: 'PASS', severity: 'LOW' }] }),
    as: (i) => i.a.inspector,
    status: 404,
  },
  {
    label: 'open a work order on an issue',
    method: 'post',
    url: (i) => `/api/issues/${i.b.openIssue}/work-orders`,
    body: (i) => ({ assigneeId: i.a.tech, dueAt: new Date().toISOString() }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'read a work order',
    method: 'get',
    url: (i) => `/api/work-orders/${i.b.workOrder}`,
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'cancel a work order',
    method: 'post',
    url: (i) => `/api/work-orders/${i.b.workOrder}/transitions`,
    body: () => ({ to: 'CANCELLED' }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'start a work order',
    method: 'post',
    url: (i) => `/api/work-orders/${i.b.workOrder}/transitions`,
    body: () => ({ to: 'IN_PROGRESS' }),
    as: (i) => i.a.tech,
    status: 404,
  },
  {
    label: 'change a member role',
    method: 'patch',
    url: (i) => `/api/members/${i.b.admin}`,
    body: () => ({ role: 'TECHNICIAN' }),
    as: (i) => i.a.admin,
    status: 404,
  },
  {
    label: 'put an asset on a site',
    method: 'post',
    url: () => '/api/assets',
    body: (i) => ({ siteId: i.b.site, name: 'Crane', category: 'X' }),
    as: (i) => i.a.admin,
    status: 422,
  },
  {
    label: 'move an asset to a site',
    method: 'patch',
    url: (i) => `/api/assets/${i.a.asset}`,
    body: (i) => ({ siteId: i.b.site, name: 'Forklift', category: 'Vehicles' }),
    as: (i) => i.a.admin,
    status: 422,
  },
  {
    label: 'schedule a template',
    method: 'post',
    url: () => '/api/schedules',
    body: (i) => ({
      templateId: i.b.template,
      assetId: i.a.asset,
      frequency: 'DAILY',
      timeOfDay: '07:00',
      assigneeId: i.a.inspector,
    }),
    as: (i) => i.a.admin,
    status: 422,
  },
  {
    label: 'schedule an asset',
    method: 'post',
    url: () => '/api/schedules',
    body: (i) => ({
      templateId: i.a.template,
      assetId: i.b.asset,
      frequency: 'DAILY',
      timeOfDay: '07:00',
      assigneeId: i.a.inspector,
    }),
    as: (i) => i.a.admin,
    status: 422,
  },
  {
    label: 'assign a schedule to an inspector',
    method: 'post',
    url: () => '/api/schedules',
    body: (i) => ({
      templateId: i.a.template,
      assetId: i.a.asset,
      frequency: 'DAILY',
      timeOfDay: '07:00',
      assigneeId: i.b.inspector,
    }),
    as: (i) => i.a.admin,
    status: 422,
  },
];

describe('Tenant isolation (integration)', () => {
  const t = useTestApp();
  const flow = flows(t);

  it('treats every Org B id as missing and leaves Org B untouched', async () => {
    const before = await snapshotOrg(t.prisma, t.ids.b.org);
    const wrong: string[] = [];
    for (const attempt of ATTEMPTS) {
      const req = t
        .http()
        [attempt.method](attempt.url(t.ids))
        .set(as(attempt.as(t.ids)));
      const res = await (attempt.body ? req.send(attempt.body(t.ids)) : req);
      if (res.status !== attempt.status)
        wrong.push(`${attempt.label}: expected ${attempt.status}, got ${res.status}`);
    }
    expect(wrong).toEqual([]);
    expect(await snapshotOrg(t.prisma, t.ids.b.org)).toEqual(before);
  });

  it("does not assign Org A's work to Org B's technician", async () => {
    const issue = await flow.openIssue();
    await flow.createWorkOrder(issue.id, t.ids.b.tech).expect(422);
    expect(await t.prisma.workOrder.count({ where: { issueId: issue.id } })).toBe(0);
  });

  it("leaves an Org B member's Org B role alone when Org A invites them", async () => {
    await t
      .http()
      .post('/api/members')
      .set(as(t.ids.a.admin))
      .send({ name: 'Bea', email: 'bea@b.test', role: 'TECHNICIAN' })
      .expect(201);
    const b = await t.prisma.membership.findFirstOrThrow({
      where: { organizationId: t.ids.b.org, userId: t.ids.b.admin },
    });
    expect(b.role).toBe('ADMIN');
  });

  it('lists only the caller organization on every collection route', async () => {
    await flow.openWorkOrder();
    const aOnly = async <T>(url: string, pick: (row: T) => string, foreign: string[]) => {
      const rows = (await t.http().get(url).set(as(t.ids.a.admin)).expect(200)).body as T[];
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map(pick).filter((id) => foreign.includes(id))).toEqual([]);
    };
    await aOnly<Site>('/api/sites', (r) => r.id, [t.ids.b.site]);
    await aOnly<{ id: string }>('/api/assets', (r) => r.id, [t.ids.b.asset]);
    await aOnly<Template>('/api/templates', (r) => r.id, [t.ids.b.template]);
    await aOnly<Schedule>('/api/schedules', (r) => r.id, [t.ids.b.schedule]);
    await aOnly<Inspection>('/api/inspections', (r) => r.id, [t.ids.b.inspection]);
    await aOnly<Issue>('/api/issues', (r) => r.id, [t.ids.b.issue, t.ids.b.openIssue]);
    await aOnly<WorkOrder>('/api/work-orders', (r) => r.id, [t.ids.b.workOrder]);
    await aOnly<Member>('/api/members', (r) => r.id, [
      t.ids.b.admin,
      t.ids.b.inspector,
      t.ids.b.tech,
    ]);
    await aOnly<AuditEvent>('/api/audit-events', (r) => r.entityId, [t.ids.b.workOrder]);
  });

  it("returns nothing for an audit filter on Org B's entity", async () => {
    const res = await t
      .http()
      .get(`/api/audit-events?entityId=${t.ids.b.workOrder}`)
      .set(as(t.ids.a.admin))
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('ignores organizationId and id smuggled into a request body', async () => {
    const res = await t
      .http()
      .post('/api/sites')
      .set(as(t.ids.a.admin))
      .send({ name: 'Smuggled', timezone: 'UTC', organizationId: t.ids.b.org, id: t.ids.b.site })
      .expect(201);
    expect(res.body.id).not.toBe(t.ids.b.site);
    const row = await t.prisma.site.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.organizationId).toBe(t.ids.a.org);
    expect(await t.prisma.site.count({ where: { organizationId: t.ids.b.org } })).toBe(1);
  });

  it("keeps each organization's record numbers independent", async () => {
    await flow.generate();
    await t.http().post('/api/schedules/generate').set(as(t.ids.b.admin)).expect(200);
    const numbers = await t.prisma.inspection.findMany({
      where: { status: 'PENDING' },
      select: { organizationId: true, number: true },
    });
    // Both organizations start their own sequence at 1001.
    expect(numbers.map((n) => n.number)).toEqual([1001, 1001]);
    expect(new Set(numbers.map((n) => n.organizationId)).size).toBe(2);
  });
});
