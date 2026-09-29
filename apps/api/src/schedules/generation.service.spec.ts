import { Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import type { PrismaService } from '../infrastructure/prisma/prisma.service';
import { GenerationService } from './generation.service';

const ORG = '11111111-1111-4111-8111-111111111111';
/** A Tuesday; London is on GMT and New York already on EDT (UTC-4). */
const NOW = new Date('2026-03-10T12:00:00.000Z');

const schedule = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  templateId: 't1',
  assetId: 'a1',
  frequency: 'DAILY',
  timeOfDay: '07:00',
  assigneeId: 'u1',
  active: true,
  ...overrides,
});

function setup(
  data: { schedules?: object[]; templates?: object[]; assets?: object[]; sites?: object[] } = {},
) {
  const tx = {
    organization: {
      update: jest
        .fn()
        .mockResolvedValue({ inspectionSeq: 1001, issueSeq: 300, workOrderSeq: 100 }),
    },
    inspection: { create: jest.fn().mockResolvedValue({ id: 'ins-1' }) },
    inspectionResponse: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const db = {
    inspectionSchedule: {
      findMany: jest.fn().mockResolvedValue(data.schedules ?? [schedule('s1')]),
    },
    inspectionTemplate: {
      findMany: jest.fn().mockResolvedValue(
        data.templates ?? [
          {
            id: 't1',
            name: 'Pre-shift',
            items: [
              { position: 0, prompt: 'Brakes hold', defaultSeverity: 'CRITICAL' },
              { position: 1, prompt: 'Horn works', defaultSeverity: 'LOW' },
            ],
          },
        ],
      ),
    },
    asset: {
      findMany: jest
        .fn()
        .mockResolvedValue(data.assets ?? [{ id: 'a1', siteId: 'site-1', name: 'Forklift' }]),
    },
    site: {
      findMany: jest
        .fn()
        .mockResolvedValue(data.sites ?? [{ id: 'site-1', timezone: 'Europe/London' }]),
    },
    inspection: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const unscoped = { organization: { findMany: jest.fn().mockResolvedValue([{ id: ORG }]) } };
  const service = new GenerationService(
    { db, unscoped } as unknown as PrismaService,
    new AuditService(),
  );
  return { service, db, tx, unscoped };
}

const inOrg = <T>(fn: () => Promise<T>) =>
  RequestContext.run({ requestId: 'req_test', organizationId: ORG }, fn);

describe('GenerationService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('runForCurrentOrganization', () => {
    it('creates the inspection, snapshots every checklist item and audits it as a system action', async () => {
      const { service, tx } = setup();
      expect(await inOrg(() => service.runForCurrentOrganization(NOW))).toBe(1);

      expect(tx.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORG }, data: { inspectionSeq: { increment: 1 } } }),
      );
      expect(tx.inspection.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG,
          number: 1001,
          scheduleId: 's1',
          assetId: 'a1',
          assigneeId: 'u1',
          templateName: 'Pre-shift',
          dueAt: new Date('2026-03-10T07:00:00.000Z'),
        },
      });
      expect(tx.inspectionResponse.createMany).toHaveBeenCalledWith({
        data: [
          {
            organizationId: ORG,
            inspectionId: 'ins-1',
            position: 0,
            itemPromptSnapshot: 'Brakes hold',
            severity: 'CRITICAL',
          },
          {
            organizationId: ORG,
            inspectionId: 'ins-1',
            position: 1,
            itemPromptSnapshot: 'Horn works',
            severity: 'LOW',
          },
        ],
      });
      expect(tx.auditEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: null,
          entityType: 'inspection',
          entityId: 'ins-1',
          action: 'GENERATED',
          message: 'INS-1001 generated from schedule (Pre-shift, Forklift)',
        }),
      });
    });

    it.each([
      ['Europe/London', '2026-03-10T07:00:00.000Z'],
      ['America/New_York', '2026-03-10T11:00:00.000Z'],
      ['Asia/Riyadh', '2026-03-10T04:00:00.000Z'],
    ])('computes the due time in the site timezone (%s)', async (timezone, due) => {
      const { service, db } = setup({ sites: [{ id: 'site-1', timezone }] });
      await inOrg(() => service.runForCurrentOrganization(NOW));
      expect(db.inspection.findFirst).toHaveBeenCalledWith({
        where: { scheduleId: 's1', dueAt: new Date(due) },
        select: { id: true },
      });
    });

    it('does nothing, and loads nothing else, without active schedules', async () => {
      const { service, db } = setup({ schedules: [] });
      expect(await inOrg(() => service.runForCurrentOrganization(NOW))).toBe(0);
      expect(db.inspectionSchedule.findMany).toHaveBeenCalledWith({ where: { active: true } });
      expect(db.inspectionTemplate.findMany).not.toHaveBeenCalled();
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('skips a period that already has its inspection without opening a transaction', async () => {
      const { service, db } = setup();
      db.inspection.findFirst.mockResolvedValue({ id: 'existing' });
      expect(await inOrg(() => service.runForCurrentOrganization(NOW))).toBe(0);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it.each([
      ['its template', { templateId: 'gone' }],
      ['its asset', { assetId: 'gone' }],
    ])('skips a schedule whose %s no longer exists', async (_label, overrides) => {
      const { service, db } = setup({ schedules: [schedule('s1', overrides)] });
      expect(await inOrg(() => service.runForCurrentOrganization(NOW))).toBe(0);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("skips a schedule whose asset's site no longer exists", async () => {
      const { service, db } = setup({ sites: [] });
      expect(await inOrg(() => service.runForCurrentOrganization(NOW))).toBe(0);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('treats losing the unique (schedule, due_at) race as "already created" and carries on', async () => {
      const { service, db, tx } = setup({ schedules: [schedule('s1'), schedule('s2')] });
      const race = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
      tx.inspection.create.mockRejectedValueOnce(race);
      expect(await inOrg(() => service.runForCurrentOrganization(NOW))).toBe(1);
      expect(db.$transaction).toHaveBeenCalledTimes(2);
    });

    it('does not swallow any other failure', async () => {
      const { service, tx } = setup();
      tx.inspection.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' }),
      );
      await expect(inOrg(() => service.runForCurrentOrganization(NOW))).rejects.toThrow('FK');
    });
  });

  describe('runForAllOrganizations', () => {
    it('runs each organization in its own tenant context and sums what was created', async () => {
      const { service, unscoped } = setup();
      const other = '22222222-2222-4222-8222-222222222222';
      unscoped.organization.findMany.mockResolvedValue([{ id: ORG }, { id: other }]);
      const seen: { organizationId?: string; requestId: string; actor?: unknown }[] = [];
      jest.spyOn(service, 'runForCurrentOrganization').mockImplementation(async (now) => {
        expect(now).toBe(NOW);
        const store = RequestContext.get()!;
        seen.push({
          organizationId: store.organizationId,
          requestId: store.requestId,
          actor: store.actor,
        });
        return seen.length;
      });

      expect(await service.runForAllOrganizations(NOW)).toBe(3);
      expect(seen.map((s) => s.organizationId)).toEqual([ORG, other]);
      expect(seen.every((s) => /^job_[0-9a-f]{12}$/.test(s.requestId))).toBe(true);
      expect(seen[0]?.requestId).not.toBe(seen[1]?.requestId);
      expect(seen.every((s) => s.actor === undefined)).toBe(true);
      expect(RequestContext.get()).toBeUndefined();
    });

    it('stops at the first organization that fails, so the job is retried', async () => {
      const { service, unscoped } = setup();
      unscoped.organization.findMany.mockResolvedValue([{ id: ORG }, { id: 'second' }]);
      const spy = jest
        .spyOn(service, 'runForCurrentOrganization')
        .mockRejectedValueOnce(new Error('db down'));
      await expect(service.runForAllOrganizations(NOW)).rejects.toThrow('db down');
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
