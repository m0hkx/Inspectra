import { apiErrorSchema, type Me } from '@inspectra/shared';
import { as, useTestApp } from './support/app';
import { bearer } from './support/clerk';

/**
 * Clerk sign-in against a real Postgres. Clerk itself is faked (support/clerk.ts),
 * so these tests cover what we own (linking accounts, onboarding) without calling
 * Clerk.
 */
describe('Clerk sign-in (integration)', () => {
  const t = useTestApp();
  const code = (body: unknown) => apiErrorSchema.parse(body).error.code;

  it.each([
    ['no authorization header', () => ({})],
    ['a forged token', () => ({ authorization: 'Bearer forged' })],
    ['another auth scheme', () => ({ authorization: 'Basic YWRhOmFkYQ==' })],
    ['a bare user id', () => ({ 'x-user-id': t.ids.a.admin })],
  ])('rejects %s with 401 UNAUTHENTICATED', async (_label, headers) => {
    const res = await t.http().get('/api/me').set(headers()).expect(401);
    expect(code(res.body)).toBe('UNAUTHENTICATED');
  });

  it('signs in a linked Clerk user and describes them on /api/me', async () => {
    const res = await t.http().get('/api/me').set(as(t.ids.a.tech)).expect(200);
    expect(res.body).toEqual({
      user: { id: t.ids.a.tech, name: 'Tia Tech', email: 'tia@a.test' },
      role: 'TECHNICIAN',
      organization: { id: t.ids.a.org, name: 'Org A' },
    });
  });

  it('onboards a new person: no organization yet, then they create one as admin', async () => {
    t.clerk.profiles.set('user_new', { name: 'Nia New', verifiedEmail: 'Nia@Example.com' });

    const before = await t.http().get('/api/me').set(bearer('user_new')).expect(403);
    expect(code(before.body)).toBe('NO_ORGANIZATION');
    const user = await t.prisma.user.findUniqueOrThrow({ where: { externalId: 'user_new' } });
    expect(user.email).toBe('nia@example.com');

    const created = await t
      .http()
      .post('/api/organizations')
      .set(bearer('user_new'))
      .send({ name: 'Acme Plant' })
      .expect(201);
    expect(created.body).toMatchObject({ role: 'ADMIN', organization: { name: 'Acme Plant' } });

    const me = await t.http().get('/api/me').set(bearer('user_new')).expect(200);
    expect((me.body as Me).organization.name).toBe('Acme Plant');
    const again = await t
      .http()
      .post('/api/organizations')
      .set(bearer('user_new'))
      .send({ name: 'Second' })
      .expect(409);
    expect(code(again.body)).toBe('CONFLICT');
  });

  it('links an invited person by verified email, landing them in the inviting organization', async () => {
    await t
      .http()
      .post('/api/members')
      .set(as(t.ids.a.admin))
      .send({ name: 'Ivy Invited', email: 'ivy@a.test', role: 'INSPECTOR' })
      .expect(201);
    t.clerk.profiles.set('user_ivy', { name: 'Ivy I.', verifiedEmail: 'ivy@a.test' });

    const res = await t.http().get('/api/me').set(bearer('user_ivy')).expect(200);
    expect(res.body).toMatchObject({
      role: 'INSPECTOR',
      organization: { id: t.ids.a.org },
      user: { name: 'Ivy Invited' },
    });
  });

  it('refuses to link an account without a verified email', async () => {
    t.clerk.profiles.set('user_unverified', { name: 'Uma', verifiedEmail: null });
    await t.http().get('/api/me').set(bearer('user_unverified')).expect(403);
    expect(await t.prisma.user.count({ where: { externalId: 'user_unverified' } })).toBe(0);
  });
});
