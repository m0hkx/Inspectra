import { randomUUID } from 'node:crypto';
import type { Asset, Site, Template } from '@inspectra/shared';
import { as, useTestApp } from './support/app';

/** Sites, assets and templates: the records schedules are built from. */
describe('Catalog (integration)', () => {
  const t = useTestApp();
  const admin = () => as(t.ids.a.admin);

  const auditFor = (entityId: string) =>
    t.prisma.auditEvent.findMany({ where: { entityId }, orderBy: { createdAt: 'asc' } });

  describe('sites', () => {
    it('creates a site and audits the input', async () => {
      const res = await t
        .http()
        .post('/api/sites')
        .set(admin())
        .send({ name: 'Depot', address: '1 Dock Rd', timezone: 'Asia/Riyadh' })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Depot',
        address: '1 Dock Rd',
        timezone: 'Asia/Riyadh',
      });
      const [event] = await auditFor(res.body.id);
      expect(event).toMatchObject({
        action: 'CREATED',
        actorId: t.ids.a.admin,
        entityType: 'site',
        message: 'created site Depot',
      });
      expect(event?.after).toEqual({
        name: 'Depot',
        address: '1 Dock Rd',
        timezone: 'Asia/Riyadh',
      });
    });

    it('lists sites by name', async () => {
      for (const name of ['Zulu Yard', 'Alpha Hub']) {
        await t.http().post('/api/sites').set(admin()).send({ name, timezone: 'UTC' }).expect(201);
      }
      const res = await t.http().get('/api/sites').set(as(t.ids.a.tech)).expect(200);
      expect((res.body as Site[]).map((s) => s.name)).toEqual(['Alpha Hub', 'Plant', 'Zulu Yard']);
    });

    it('updates a site and records before and after', async () => {
      const res = await t
        .http()
        .patch(`/api/sites/${t.ids.a.site}`)
        .set(admin())
        .send({ name: 'Plant North', timezone: 'Europe/Paris' })
        .expect(200);
      expect(res.body).toMatchObject({
        id: t.ids.a.site,
        name: 'Plant North',
        timezone: 'Europe/Paris',
      });
      const [event] = await auditFor(t.ids.a.site);
      expect(event).toMatchObject({ action: 'UPDATED', message: 'updated site Plant North' });
      expect(event?.before).toMatchObject({ name: 'Plant', timezone: 'Europe/London' });
      expect(event?.after).toMatchObject({ name: 'Plant North', timezone: 'Europe/Paris' });
    });

    it('returns 404 for an unknown site and audits nothing', async () => {
      const res = await t
        .http()
        .patch(`/api/sites/${randomUUID()}`)
        .set(admin())
        .send({ name: 'Ghost', timezone: 'UTC' })
        .expect(404);
      expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Site not found.' });
      expect(await t.prisma.auditEvent.count()).toBe(1); // only the fixture's Org B event
    });
  });

  describe('assets', () => {
    const crane = () => ({
      siteId: t.ids.a.site,
      name: 'Crane',
      category: 'Lifting',
      serial: 'CR-1',
      location: 'Bay 3',
      status: 'OUT_OF_SERVICE',
    });

    it('creates an asset on a site of the organization', async () => {
      const res = await t.http().post('/api/assets').set(admin()).send(crane()).expect(201);
      expect(res.body).toEqual({ id: expect.any(String), ...crane() });
      const [event] = await auditFor(res.body.id);
      expect(event).toMatchObject({
        action: 'CREATED',
        entityType: 'asset',
        message: 'created asset Crane',
      });
    });

    it('reads one asset, and lists them by name', async () => {
      const created = (await t.http().post('/api/assets').set(admin()).send(crane()).expect(201))
        .body as Asset;
      const one = await t
        .http()
        .get(`/api/assets/${created.id}`)
        .set(as(t.ids.a.inspector))
        .expect(200);
      expect(one.body).toEqual(created);
      const list = await t.http().get('/api/assets').set(as(t.ids.a.tech)).expect(200);
      expect((list.body as Asset[]).map((a) => a.name)).toEqual(['Crane', 'Forklift']);
    });

    it('refuses a site that does not exist', async () => {
      const res = await t
        .http()
        .post('/api/assets')
        .set(admin())
        .send({ ...crane(), siteId: randomUUID() })
        .expect(422);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        message: 'Choose a site from this organization.',
      });
      expect(await t.prisma.asset.count({ where: { name: 'Crane' } })).toBe(0);
    });

    it('moves an asset between sites and records before and after', async () => {
      const other = (
        await t
          .http()
          .post('/api/sites')
          .set(admin())
          .send({ name: 'Annex', timezone: 'UTC' })
          .expect(201)
      ).body as Site;
      await t
        .http()
        .patch(`/api/assets/${t.ids.a.asset}`)
        .set(admin())
        .send({ siteId: other.id, name: 'Forklift', category: 'Vehicles' })
        .expect(200);
      const [event] = await auditFor(t.ids.a.asset);
      expect(event?.before).toMatchObject({ siteId: t.ids.a.site });
      expect(event?.after).toMatchObject({ siteId: other.id });
    });

    it('returns 404 for an unknown asset', async () => {
      await t.http().get(`/api/assets/${randomUUID()}`).set(admin()).expect(404);
      await t.http().patch(`/api/assets/${randomUUID()}`).set(admin()).send(crane()).expect(404);
    });
  });

  describe('templates', () => {
    const items = [
      { prompt: 'Guard rails fixed', defaultSeverity: 'HIGH' },
      { prompt: 'Chain lubricated', defaultSeverity: 'LOW' },
      { prompt: 'Load plate legible', defaultSeverity: 'MEDIUM' },
    ];

    it('creates a template with its items in the order given', async () => {
      const res = await t
        .http()
        .post('/api/templates')
        .set(admin())
        .send({ name: 'Hoist check', items })
        .expect(201);
      const template = res.body as Template;
      expect(template).toMatchObject({ name: 'Hoist check', description: '' });
      expect(
        template.items.map(({ prompt, defaultSeverity }) => ({ prompt, defaultSeverity })),
      ).toEqual(items);
      const rows = await t.prisma.templateItem.findMany({
        where: { templateId: template.id },
        orderBy: { position: 'asc' },
      });
      expect(rows.map((r) => [r.position, r.organizationId])).toEqual([
        [0, t.ids.a.org],
        [1, t.ids.a.org],
        [2, t.ids.a.org],
      ]);
      const [event] = await auditFor(template.id);
      expect(event).toMatchObject({ action: 'CREATED', entityType: 'template' });
    });

    it('replaces the whole checklist on update, including reordering', async () => {
      const res = await t
        .http()
        .put(`/api/templates/${t.ids.a.template}`)
        .set(admin())
        .send({
          name: 'Pre-shift v2',
          description: 'Revised',
          items: [items[2], { prompt: 'Horn works', defaultSeverity: 'HIGH' }],
        })
        .expect(200);
      expect((res.body as Template).items.map((i) => i.prompt)).toEqual([
        'Load plate legible',
        'Horn works',
      ]);
      expect(await t.prisma.templateItem.count({ where: { templateId: t.ids.a.template } })).toBe(
        2,
      );
      const event = await t.prisma.auditEvent.findFirstOrThrow({
        where: { entityId: t.ids.a.template },
      });
      expect((event.before as unknown as Template).items.map((i) => i.prompt)).toEqual([
        'Brakes hold',
        'Horn works',
      ]);
      expect((event.after as unknown as Template).name).toBe('Pre-shift v2');
    });

    it('lists templates by name with items in position order', async () => {
      await t
        .http()
        .post('/api/templates')
        .set(admin())
        .send({ name: 'Annual audit', items })
        .expect(201);
      const res = await t.http().get('/api/templates').set(as(t.ids.a.inspector)).expect(200);
      const list = res.body as Template[];
      expect(list.map((x) => x.name)).toEqual(['Annual audit', 'Pre-shift']);
      expect(list[1]?.items.map((i) => i.prompt)).toEqual(['Brakes hold', 'Horn works']);
    });

    it('returns 404 for an unknown template and keeps nothing', async () => {
      await t
        .http()
        .put(`/api/templates/${randomUUID()}`)
        .set(admin())
        .send({ name: 'Ghost', items })
        .expect(404);
      expect(await t.prisma.templateItem.count({ where: { prompt: items[0]!.prompt } })).toBe(0);
    });
  });
});
