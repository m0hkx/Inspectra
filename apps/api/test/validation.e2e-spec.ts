import { randomUUID } from 'node:crypto';
import { apiErrorSchema } from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import type { Fixture } from './support/fixture';

interface Case {
  label: string;
  method: 'post' | 'put' | 'patch' | 'get';
  url: (ids: Fixture) => string;
  body?: unknown;
  /** Field the first reported problem points at ("body" for the payload as a whole). */
  path: string;
  message?: string;
}

const id = randomUUID();
const site = { name: 'Depot', timezone: 'UTC' };
const template = { name: 'T', items: [{ prompt: 'Check', defaultSeverity: 'LOW' }] };

/** Every payload schema, shown to reject what it must, with a field path the UI can highlight. */
const CASES: Case[] = [
  { label: 'site without a body', method: 'post', url: () => '/api/sites', path: 'body' },
  {
    label: 'site with an empty object',
    method: 'post',
    url: () => '/api/sites',
    body: {},
    path: 'name',
  },
  {
    label: 'site with a blank name',
    method: 'post',
    url: () => '/api/sites',
    body: { ...site, name: '   ' },
    path: 'name',
    message: 'Name is required.',
  },
  {
    label: 'site with a 121-character name',
    method: 'post',
    url: () => '/api/sites',
    body: { ...site, name: 'x'.repeat(121) },
    path: 'name',
  },
  {
    label: 'site with an unknown timezone',
    method: 'post',
    url: () => '/api/sites',
    body: { ...site, timezone: 'Mars/Olympus_Mons' },
    path: 'timezone',
    message: 'Unknown timezone.',
  },
  {
    label: 'site with a numeric name',
    method: 'post',
    url: () => '/api/sites',
    body: { ...site, name: 42 },
    path: 'name',
  },
  {
    label: 'site payload that is an array',
    method: 'post',
    url: () => '/api/sites',
    body: [site],
    path: 'body',
  },
  {
    label: 'asset without a category',
    method: 'post',
    url: () => '/api/assets',
    body: { siteId: id, name: 'Crane' },
    path: 'category',
  },
  {
    label: 'asset with an unknown status',
    method: 'post',
    url: () => '/api/assets',
    body: { siteId: id, name: 'Crane', category: 'X', status: 'BROKEN' },
    path: 'status',
  },
  {
    label: 'template without items',
    method: 'post',
    url: () => '/api/templates',
    body: { ...template, items: [] },
    path: 'items',
    message: 'Add at least one checklist item.',
  },
  {
    label: 'template item without a prompt',
    method: 'post',
    url: () => '/api/templates',
    body: { ...template, items: [{ prompt: ' ', defaultSeverity: 'LOW' }] },
    path: 'items.0.prompt',
  },
  {
    label: 'template item with an unknown severity',
    method: 'put',
    url: (i) => `/api/templates/${i.a.template}`,
    body: { ...template, items: [{ prompt: 'p', defaultSeverity: 'URGENT' }] },
    path: 'items.0.defaultSeverity',
  },
  {
    label: 'template with 101 items',
    method: 'post',
    url: () => '/api/templates',
    body: { ...template, items: Array.from({ length: 101 }, () => template.items[0]) },
    path: 'items',
  },
  {
    label: 'schedule at 24:00',
    method: 'post',
    url: () => '/api/schedules',
    body: { templateId: id, assetId: id, frequency: 'DAILY', timeOfDay: '24:00', assigneeId: id },
    path: 'timeOfDay',
    message: 'Use HH:mm, e.g. 09:00.',
  },
  {
    label: 'schedule at 7:00 (no leading zero)',
    method: 'post',
    url: () => '/api/schedules',
    body: { templateId: id, assetId: id, frequency: 'DAILY', timeOfDay: '7:00', assigneeId: id },
    path: 'timeOfDay',
  },
  {
    label: 'schedule every hour',
    method: 'post',
    url: () => '/api/schedules',
    body: { templateId: id, assetId: id, frequency: 'HOURLY', timeOfDay: '07:00', assigneeId: id },
    path: 'frequency',
  },
  {
    label: 'schedule toggle that is not a boolean',
    method: 'patch',
    url: (i) => `/api/schedules/${i.a.schedule}`,
    body: { active: 'yes' },
    path: 'active',
  },
  {
    label: 'invite with an invalid email',
    method: 'post',
    url: () => '/api/members',
    body: { name: 'N', email: 'not-an-email', role: 'ADMIN' },
    path: 'email',
  },
  {
    label: 'invite with an unknown role',
    method: 'post',
    url: () => '/api/members',
    body: { name: 'N', email: 'n@a.test', role: 'OWNER' },
    path: 'role',
  },
  {
    label: 'role change to an unknown role',
    method: 'patch',
    url: (i) => `/api/members/${i.a.tech}`,
    body: { role: 'SUPERUSER' },
    path: 'role',
  },
  {
    label: 'work order due "tomorrow"',
    method: 'post',
    url: () => `/api/issues/${id}/work-orders`,
    body: { assigneeId: id, dueAt: 'tomorrow' },
    path: 'dueAt',
  },
  {
    label: 'transition to an unknown status',
    method: 'post',
    url: () => `/api/work-orders/${id}/transitions`,
    body: { to: 'DONE' },
    path: 'to',
  },
  {
    label: 'transition with a 1001-character reason',
    method: 'post',
    url: () => `/api/work-orders/${id}/transitions`,
    body: { to: 'IN_PROGRESS', reason: 'x'.repeat(1001) },
    path: 'reason',
  },
  {
    label: 'submit with no responses',
    method: 'post',
    url: () => `/api/inspections/${id}/submit`,
    body: { responses: [] },
    path: 'responses',
  },
  {
    label: 'submit with an unknown result',
    method: 'post',
    url: () => `/api/inspections/${id}/submit`,
    body: { responses: [{ id, result: 'MAYBE', severity: 'LOW' }] },
    path: 'responses.0.result',
  },
  {
    label: 'audit limit of 0',
    method: 'get',
    url: () => '/api/audit-events?limit=0',
    path: 'limit',
  },
  {
    label: 'audit limit of 501',
    method: 'get',
    url: () => '/api/audit-events?limit=501',
    path: 'limit',
  },
  {
    label: 'audit limit that is not a number',
    method: 'get',
    url: () => '/api/audit-events?limit=lots',
    path: 'limit',
  },
  {
    label: 'audit filter on an unknown entity type',
    method: 'get',
    url: () => '/api/audit-events?entityType=planet',
    path: 'entityType',
  },
];

describe('Request validation (integration)', () => {
  const t = useTestApp();

  // Admin for everything except submit, which only an inspector may reach.
  const caller = (c: Case) =>
    c.url(t.ids).includes('/submit') ? t.ids.a.inspector : t.ids.a.admin;

  it.each(CASES)('rejects a $label', async (c) => {
    const req = t
      .http()
      [c.method](c.url(t.ids))
      .set(as(caller(c)));
    const res = await (c.body === undefined ? req : req.send(c.body as object)).expect(400);
    const { error } = apiErrorSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.[0]?.path).toBe(c.path);
    expect(error.message).toBe(error.details?.[0]?.message);
    if (c.message) expect(error.message).toBe(c.message);
  });

  it('reports every failing field, not only the first', async () => {
    const res = await t
      .http()
      .post('/api/assets')
      .set(as(t.ids.a.admin))
      .send({ status: 'BROKEN' })
      .expect(400);
    const paths = apiErrorSchema.parse(res.body).error.details?.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['siteId', 'name', 'category', 'status']));
  });

  it('writes nothing, not even an audit event, for a rejected payload', async () => {
    const before = await t.prisma.auditEvent.count();
    await t.http().post('/api/sites').set(as(t.ids.a.admin)).send({ name: '' }).expect(400);
    await t
      .http()
      .put(`/api/templates/${t.ids.a.template}`)
      .set(as(t.ids.a.admin))
      .send({ name: 'X', items: [] })
      .expect(400);
    expect(await t.prisma.auditEvent.count()).toBe(before);
    expect(await t.prisma.templateItem.count({ where: { templateId: t.ids.a.template } })).toBe(2);
  });

  it.each([
    ['GET', '/api/assets/123'],
    ['PATCH', '/api/sites/abc'],
    ['PUT', "/api/templates/1'%20OR%20'1'='1"],
    ['POST', '/api/work-orders/%00/transitions'],
    ['DELETE', '/api/schedules/not-a-schedule'],
  ])('rejects %s %s: path ids must be UUIDs', async (method, url) => {
    const res = await t
      .http()
      [method.toLowerCase() as 'get'](url)
      .set(as(t.ids.a.admin))
      .send({})
      .expect(400);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
  });

  describe('normalizes what it accepts', () => {
    it('trims text and fills defaults', async () => {
      const res = await t
        .http()
        .post('/api/sites')
        .set(as(t.ids.a.admin))
        .send({ name: '  Depot  ', timezone: 'Asia/Riyadh' })
        .expect(201);
      expect(res.body).toMatchObject({ name: 'Depot', address: '', timezone: 'Asia/Riyadh' });
    });

    it('fills asset defaults', async () => {
      const res = await t
        .http()
        .post('/api/assets')
        .set(as(t.ids.a.admin))
        .send({ siteId: t.ids.a.site, name: 'Crane', category: 'Lifting' })
        .expect(201);
      expect(res.body).toMatchObject({ serial: '', location: '', status: 'ACTIVE' });
    });

    it('stores invited emails in lower case', async () => {
      await t
        .http()
        .post('/api/members')
        .set(as(t.ids.a.admin))
        .send({ name: 'Nia', email: 'Nia.New@A.Test', role: 'INSPECTOR' })
        .expect(201);
      expect(await t.prisma.user.findUnique({ where: { email: 'nia.new@a.test' } })).not.toBeNull();
    });

    it('accepts a due date with a UTC offset', async () => {
      const res = await t
        .http()
        .post(`/api/issues/${randomUUID()}/work-orders`)
        .set(as(t.ids.a.admin))
        .send({ assigneeId: t.ids.a.tech, dueAt: '2030-01-01T09:00:00+03:00' });
      // Past validation: the made-up issue id is what fails.
      expect(res.status).toBe(404);
    });

    it('defaults the audit limit to 200', async () => {
      await t.prisma.auditEvent.createMany({
        data: Array.from({ length: 205 }, (_, n) => ({
          organizationId: t.ids.a.org,
          entityType: 'site',
          entityId: t.ids.a.site,
          action: 'UPDATED',
          message: `update ${n}`,
        })),
      });
      const res = await t.http().get('/api/audit-events').set(as(t.ids.a.admin)).expect(200);
      expect(res.body).toHaveLength(200);
    });
  });
});
