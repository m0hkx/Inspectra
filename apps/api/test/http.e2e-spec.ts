import { apiErrorSchema, healthResponseSchema, type Site } from '@inspectra/shared';
import { as, useTestApp } from './support/app';

/**
 * The HTTP surface every route shares: prefix, request ids, the error body, CORS,
 * and which organization the caller acts in. Sign-in itself is in auth.e2e-spec.ts.
 */
describe('HTTP surface (integration)', () => {
  const t = useTestApp();

  const siteNames = async (headers: Record<string, string>) =>
    ((await t.http().get('/api/sites').set(headers).expect(200)).body as Site[]).map((s) => s.name);

  describe('health', () => {
    it('is public and matches the shared contract', async () => {
      const res = await t.http().get('/api/health').expect(200);
      expect(healthResponseSchema.parse(res.body).status).toBe('ok');
    });

    it('only exists under the /api prefix', async () => {
      await t.http().get('/health').expect(404);
    });
  });

  describe('request ids', () => {
    it('generates one when the client sends none', async () => {
      const res = await t.http().get('/api/health').expect(200);
      expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f]{12}$/);
    });

    it('generates a different one for every request', async () => {
      const ids = await Promise.all(
        Array.from(
          { length: 5 },
          async () => (await t.http().get('/api/health')).headers['x-request-id'],
        ),
      );
      expect(new Set(ids).size).toBe(5);
    });

    it('echoes a well-formed incoming id', async () => {
      const res = await t
        .http()
        .get('/api/health')
        .set('x-request-id', 'trace_ABC-123456')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('trace_ABC-123456');
    });

    it.each([
      ['too short', 'abc'],
      ['too long', 'x'.repeat(65)],
      ['header injection characters', 'abc def\tghi'],
      ['path characters', '../../etc/passwd'],
    ])('replaces an incoming id that is %s', async (_label, incoming) => {
      const res = await t.http().get('/api/health').set('x-request-id', incoming).expect(200);
      expect(res.headers['x-request-id']).toMatch(/^req_[0-9a-f]{12}$/);
    });

    it('puts the same id in the error body and the header', async () => {
      const res = await t
        .http()
        .get('/api/sites')
        .set('x-request-id', 'support_ticket_42')
        .expect(401);
      expect(apiErrorSchema.parse(res.body).error.requestId).toBe('support_ticket_42');
      expect(res.headers['x-request-id']).toBe('support_ticket_42');
    });
  });

  describe('errors', () => {
    it('renders unknown routes as NOT_FOUND in the API error shape', async () => {
      const res = await t.http().get('/api/does-not-exist').set(as(t.ids.a.admin)).expect(404);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    });

    it('renders unsupported methods on known paths as NOT_FOUND', async () => {
      const res = await t.http().delete('/api/sites').set(as(t.ids.a.admin)).expect(404);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('NOT_FOUND');
    });

    it('rejects a malformed path id before it reaches the database', async () => {
      const res = await t.http().get('/api/assets/not-a-uuid').set(as(t.ids.a.admin)).expect(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects a malformed JSON body as VALIDATION_FAILED', async () => {
      const res = await t
        .http()
        .post('/api/sites')
        .set(as(t.ids.a.admin))
        .set('content-type', 'application/json')
        .send('{"name": "Depot",')
        .expect(400);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
      expect(await t.prisma.site.count({ where: { name: 'Depot' } })).toBe(0);
    });
  });

  describe('CORS', () => {
    it('answers a preflight from the web origin with credentials allowed', async () => {
      const res = await t
        .http()
        .options('/api/sites')
        .set('origin', 'http://localhost:3000')
        .set('access-control-request-method', 'POST')
        .set('access-control-request-headers', 'content-type,authorization')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('never reflects another origin', async () => {
      const res = await t.http().get('/api/health').set('origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    });
  });

  describe('organization selection', () => {
    /** Bea is Org B's admin; this also makes her a technician in Org A (a later membership). */
    beforeEach(async () => {
      await t.prisma.membership.create({
        data: { organizationId: t.ids.a.org, userId: t.ids.b.admin, role: 'TECHNICIAN' },
      });
    });

    it('defaults to the earliest membership', async () => {
      expect(await siteNames(as(t.ids.b.admin))).toEqual(['Lab']);
    });

    it('acts in the organization named by x-organization-id, with that role', async () => {
      expect(await siteNames(as(t.ids.b.admin, t.ids.a.org))).toEqual(['Plant']);
      const me = await t.http().get('/api/me').set(as(t.ids.b.admin, t.ids.a.org)).expect(200);
      expect(me.body.role).toBe('TECHNICIAN');
      // Admin in B, but only a technician in A: A's admin routes stay closed.
      await t
        .http()
        .post('/api/sites')
        .set(as(t.ids.b.admin, t.ids.a.org))
        .send({ name: 'X', timezone: 'UTC' })
        .expect(403);
    });

    it('refuses an organization the caller is not a member of', async () => {
      const res = await t.http().get('/api/sites').set(as(t.ids.a.admin, t.ids.b.org)).expect(403);
      expect(apiErrorSchema.parse(res.body).error.code).toBe('NO_ORGANIZATION');
    });

    it('ignores a malformed x-organization-id and falls back to the default', async () => {
      expect(await siteNames({ ...as(t.ids.b.admin), 'x-organization-id': 'not-a-uuid' })).toEqual([
        'Lab',
      ]);
    });
  });
});
