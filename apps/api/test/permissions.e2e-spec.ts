import { randomUUID } from 'node:crypto';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { apiErrorSchema } from '@inspectra/shared';
import { IS_PUBLIC } from '../src/common/auth/decorators';
import { FeaturesModule } from '../src/features.module';
import { as, useTestApp } from './support/app';
import type { Fixture } from './support/fixture';

type Role = 'admin' | 'inspector' | 'tech';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface Route {
  /** Route pattern as Nest registers it, e.g. `PATCH /api/sites/:id`. */
  route: string;
  url: (ids: Fixture) => string;
  body?: (ids: Fixture) => object;
  /** Roles that get past authorization (the guard and any service-level check). */
  allowed: Role[];
}

const ALL: Role[] = ['admin', 'inspector', 'tech'];
const missing = randomUUID();

/**
 * Who may call what. Allowed callers must not get 401/403 (they may still get a 404
 * or 422 for the placeholder ids); everyone else must get 403 FORBIDDEN.
 */
const ROUTES: Route[] = [
  { route: 'GET /api/me', url: () => '/api/me', allowed: ALL },
  { route: 'GET /api/members', url: () => '/api/members', allowed: ALL },
  {
    route: 'POST /api/members',
    url: () => '/api/members',
    body: () => ({ name: 'New Person', email: 'new@a.test', role: 'TECHNICIAN' }),
    allowed: ['admin'],
  },
  {
    route: 'PATCH /api/members/:userId',
    url: (ids) => `/api/members/${ids.a.tech2}`,
    body: () => ({ role: 'INSPECTOR' }),
    allowed: ['admin'],
  },
  { route: 'GET /api/sites', url: () => '/api/sites', allowed: ALL },
  {
    route: 'POST /api/sites',
    url: () => '/api/sites',
    body: () => ({ name: 'Depot', timezone: 'UTC' }),
    allowed: ['admin'],
  },
  {
    route: 'PATCH /api/sites/:id',
    url: (ids) => `/api/sites/${ids.a.site}`,
    body: () => ({ name: 'Plant 2', timezone: 'UTC' }),
    allowed: ['admin'],
  },
  { route: 'GET /api/assets', url: () => '/api/assets', allowed: ALL },
  { route: 'GET /api/assets/:id', url: (ids) => `/api/assets/${ids.a.asset}`, allowed: ALL },
  {
    route: 'POST /api/assets',
    url: () => '/api/assets',
    body: (ids) => ({ siteId: ids.a.site, name: 'Crane', category: 'Vehicles' }),
    allowed: ['admin'],
  },
  {
    route: 'PATCH /api/assets/:id',
    url: (ids) => `/api/assets/${ids.a.asset}`,
    body: (ids) => ({ siteId: ids.a.site, name: 'Forklift 2', category: 'Vehicles' }),
    allowed: ['admin'],
  },
  { route: 'GET /api/templates', url: () => '/api/templates', allowed: ALL },
  {
    route: 'POST /api/templates',
    url: () => '/api/templates',
    body: () => ({ name: 'T', items: [{ prompt: 'p', defaultSeverity: 'LOW' }] }),
    allowed: ['admin'],
  },
  {
    route: 'PUT /api/templates/:id',
    url: (ids) => `/api/templates/${ids.a.template}`,
    body: () => ({ name: 'T', items: [{ prompt: 'p', defaultSeverity: 'LOW' }] }),
    allowed: ['admin'],
  },
  { route: 'GET /api/schedules', url: () => '/api/schedules', allowed: ALL },
  {
    route: 'POST /api/schedules',
    url: () => '/api/schedules',
    body: (ids) => ({
      templateId: ids.a.template,
      assetId: ids.a.asset,
      frequency: 'WEEKLY',
      timeOfDay: '10:00',
      assigneeId: ids.a.inspector,
    }),
    allowed: ['admin'],
  },
  {
    route: 'PATCH /api/schedules/:id',
    url: (ids) => `/api/schedules/${ids.a.schedule}`,
    body: () => ({ active: false }),
    allowed: ['admin'],
  },
  // A missing id, so the admin's call (404) deletes nothing the other routes rely on.
  { route: 'DELETE /api/schedules/:id', url: () => `/api/schedules/${missing}`, allowed: ['admin'] },
  {
    route: 'POST /api/schedules/generate',
    url: () => '/api/schedules/generate',
    allowed: ['admin'],
  },
  // Technicians are refused by the service (no inspection visibility), not by a route permission.
  { route: 'GET /api/inspections', url: () => '/api/inspections', allowed: ['admin', 'inspector'] },
  {
    route: 'GET /api/inspections/:id',
    url: () => `/api/inspections/${missing}`,
    allowed: ['admin', 'inspector'],
  },
  {
    route: 'POST /api/inspections/:id/submit',
    url: () => `/api/inspections/${missing}/submit`,
    body: () => ({ responses: [{ id: missing, result: 'PASS', severity: 'LOW' }] }),
    allowed: ['inspector'],
  },
  { route: 'GET /api/issues', url: () => '/api/issues', allowed: ALL },
  {
    route: 'POST /api/issues/:id/work-orders',
    url: () => `/api/issues/${missing}/work-orders`,
    body: (ids) => ({ assigneeId: ids.a.tech, dueAt: new Date().toISOString() }),
    allowed: ['admin'],
  },
  { route: 'GET /api/work-orders', url: () => '/api/work-orders', allowed: ALL },
  { route: 'GET /api/work-orders/:id', url: () => `/api/work-orders/${missing}`, allowed: ALL },
  // No route permission: the shared transition table decides who may make which move.
  {
    route: 'POST /api/work-orders/:id/transitions',
    url: () => `/api/work-orders/${missing}/transitions`,
    body: () => ({ to: 'IN_PROGRESS' }),
    allowed: ALL,
  },
  { route: 'GET /api/audit-events', url: () => '/api/audit-events', allowed: ALL },
];

/** Onboarding routes without an organization; covered by auth.e2e-spec.ts. */
const COVERED_ELSEWHERE = new Set(['OrganizationsController']);

describe('Authorization matrix (integration)', () => {
  const t = useTestApp();

  const call = (r: Route, headers: Record<string, string>) => {
    const method = r.route.split(' ')[0]!.toLowerCase() as Method;
    const req = t.http()[method](r.url(t.ids)).set(headers);
    return r.body ? req.send(r.body(t.ids)) : req;
  };

  it('lists every route of the domain controllers, none of them public', () => {
    const controllers = (
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, FeaturesModule) as Function[]
    ).filter((c) => !COVERED_ELSEWHERE.has(c.name));
    const registered: string[] = [];
    const publicRoutes: string[] = [];
    for (const controller of controllers) {
      const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name] as Function;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined || name === 'constructor') continue;
        const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const route = `${method} /${['api', prefix, path]
          .flatMap((p) => p.split('/'))
          .filter(Boolean)
          .join('/')}`;
        const isPublic =
          Reflect.getMetadata(IS_PUBLIC, handler) || Reflect.getMetadata(IS_PUBLIC, controller);
        (isPublic ? publicRoutes : registered).push(route);
      }
    }
    expect(registered.sort()).toEqual(ROUTES.map((r) => r.route).sort());
    expect(publicRoutes).toEqual([]);
  });

  it('refuses every non-public route without a signed-in user', async () => {
    const wrong: string[] = [];
    for (const r of ROUTES) {
      const res = await call(r, {});
      if (
        res.status !== 401 ||
        apiErrorSchema.safeParse(res.body).data?.error.code !== 'UNAUTHENTICATED'
      ) {
        wrong.push(`${r.route} → ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it.each(['admin', 'inspector', 'tech'] as const)(
    'lets %s through exactly the routes it is allowed',
    async (role) => {
      const userId = t.ids.a[role];
      const wrong: string[] = [];
      for (const r of ROUTES) {
        const res = await call(r, as(userId));
        const allowed = r.allowed.includes(role);
        if (allowed && (res.status === 401 || res.status === 403 || res.status >= 500)) {
          wrong.push(`${r.route}: expected access, got ${res.status} ${JSON.stringify(res.body)}`);
        }
        if (!allowed && (res.status !== 403 || res.body?.error?.code !== 'FORBIDDEN')) {
          wrong.push(`${r.route}: expected 403 FORBIDDEN, got ${res.status}`);
        }
      }
      expect(wrong).toEqual([]);
    },
  );
});
