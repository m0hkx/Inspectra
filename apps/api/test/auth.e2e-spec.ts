import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { apiErrorSchema, type Me } from '@inspectra/shared';
import type { PrismaClient } from '../src/generated/prisma/client';
import type { ClerkProfile } from '../src/common/auth/clerk.service';
import { AppError } from '../src/common/errors/app-error';
import { TEST_DATABASE_URL } from './global-setup';

/**
 * AUTH_MODE=clerk against a real Postgres. Clerk itself is faked: a token is just
 * `token:<clerk user id>`, so these tests cover what we own (linking accounts,
 * onboarding, keeping demo logins inside the demo) without calling Clerk.
 */
describe('Clerk sign-in (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  const profiles = new Map<string, ClerkProfile>();
  let demo: { org: string; admin: string };
  let real: { org: string; admin: string };

  const fakeClerk = {
    mode: 'clerk',
    enabled: true,
    verify: async (token: string) => {
      const clerkUserId = token.startsWith('token:') ? token.slice('token:'.length) : null;
      if (!clerkUserId)
        throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
      return clerkUserId;
    },
    profile: async (clerkUserId: string) => profiles.get(clerkUserId)!,
  };

  const bearer = (clerkUserId: string) => ({ authorization: `Bearer token:${clerkUserId}` });
  const http = () => request(app.getHttpServer());
  const code = (body: unknown) => apiErrorSchema.parse(body).error.code;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.REDIS_URL = '';
    process.env.AUTH_MODE = 'clerk';

    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/app.setup.js');
    const { PrismaService } = await import('../src/infrastructure/prisma/prisma.service.js');
    const { ClerkService } = await import('../src/common/auth/clerk.service.js');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ClerkService)
      .useValue(fakeClerk)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService).unscoped;
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE audit_events, work_orders, issues, inspection_responses, inspections, inspection_schedules, template_items, inspection_templates, assets, sites, memberships, users, organizations CASCADE',
    );
    profiles.clear();
    demo = { org: randomUUID(), admin: randomUUID() };
    real = { org: randomUUID(), admin: randomUUID() };
    await prisma.organization.createMany({
      data: [
        { id: demo.org, name: 'Demo Org', isDemo: true },
        { id: real.org, name: 'Real Org' },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: demo.admin, name: 'Dee Demo', email: 'dee@demo.test' },
        { id: real.admin, name: 'Rae Real', email: 'rae@real.test', externalId: 'user_rae' },
      ],
    });
    await prisma.membership.createMany({
      data: [
        { organizationId: demo.org, userId: demo.admin, role: 'ADMIN' },
        { organizationId: real.org, userId: real.admin, role: 'ADMIN' },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects requests with no credentials and invalid tokens', async () => {
    expect(code((await http().get('/api/me').expect(401)).body)).toBe('UNAUTHENTICATED');
    const res = await http().get('/api/me').set({ authorization: 'Bearer forged' }).expect(401);
    expect(code(res.body)).toBe('UNAUTHENTICATED');
  });

  it('signs in a linked Clerk user as their membership', async () => {
    const res = await http().get('/api/me').set(bearer('user_rae')).expect(200);
    expect((res.body as Me).organization.id).toBe(real.org);
    expect((res.body as Me).role).toBe('ADMIN');
  });

  it('onboards a new person: no organization yet, then they create one as admin', async () => {
    profiles.set('user_new', { name: 'Nia New', verifiedEmail: 'Nia@Example.com' });

    const before = await http().get('/api/me').set(bearer('user_new')).expect(403);
    expect(code(before.body)).toBe('NO_ORGANIZATION');
    const user = await prisma.user.findUniqueOrThrow({ where: { externalId: 'user_new' } });
    expect(user.email).toBe('nia@example.com');

    const created = await http()
      .post('/api/organizations')
      .set(bearer('user_new'))
      .send({ name: 'Acme Plant' })
      .expect(201);
    expect(created.body).toMatchObject({ role: 'ADMIN', organization: { name: 'Acme Plant' } });

    const me = await http().get('/api/me').set(bearer('user_new')).expect(200);
    expect((me.body as Me).organization.name).toBe('Acme Plant');
    const again = await http()
      .post('/api/organizations')
      .set(bearer('user_new'))
      .send({ name: 'Second' })
      .expect(409);
    expect(code(again.body)).toBe('CONFLICT');
  });

  it('links an invited person by verified email, landing them in the inviting organization', async () => {
    await http()
      .post('/api/members')
      .set(bearer('user_rae'))
      .send({ name: 'Ivy Invited', email: 'ivy@real.test', role: 'INSPECTOR' })
      .expect(201);
    profiles.set('user_ivy', { name: 'Ivy I.', verifiedEmail: 'ivy@real.test' });

    const res = await http().get('/api/me').set(bearer('user_ivy')).expect(200);
    expect(res.body).toMatchObject({
      role: 'INSPECTOR',
      organization: { id: real.org },
      user: { name: 'Ivy Invited' },
    });
  });

  it('refuses to link an account without a verified email', async () => {
    profiles.set('user_unverified', { name: 'Uma', verifiedEmail: null });
    await http().get('/api/me').set(bearer('user_unverified')).expect(403);
    expect(await prisma.user.count({ where: { externalId: 'user_unverified' } })).toBe(0);
  });

  it('allows demo logins only for unlinked members of demo organizations', async () => {
    await http().get('/api/me').set({ 'x-user-id': demo.admin }).expect(200);
    const res = await http().get('/api/me').set({ 'x-user-id': real.admin }).expect(401);
    expect(code(res.body)).toBe('UNAUTHENTICATED');

    const listed = await http().get('/api/auth/demo-users').expect(200);
    expect((listed.body as { id: string }[]).map((u) => u.id)).toEqual([demo.admin]);
  });

  it('takes a real person out of the demo when they link an account a demo visitor invited', async () => {
    await http()
      .post('/api/members')
      .set({ 'x-user-id': demo.admin })
      .send({ name: 'Val', email: 'val@example.com', role: 'TECHNICIAN' })
      .expect(201);
    const invited = await prisma.user.findUniqueOrThrow({ where: { email: 'val@example.com' } });
    profiles.set('user_val', { name: 'Val', verifiedEmail: 'val@example.com' });

    const res = await http().get('/api/me').set(bearer('user_val')).expect(403);
    expect(code(res.body)).toBe('NO_ORGANIZATION');
    // Linked, so demo visitors can no longer act as them.
    await http().get('/api/me').set({ 'x-user-id': invited.id }).expect(401);
  });
});
