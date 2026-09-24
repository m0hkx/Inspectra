import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { nextDueAt } from '@inspectra/shared';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { nextNumber } from '../common/numbering';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

/**
 * Creates the current period's inspection for every active schedule.
 *
 * Idempotency lives in the database: UNIQUE (schedule_id, due_at). Running this twice,
 * or on two workers at once, creates each inspection exactly once. The pre-check only
 * avoids noisy constraint errors on the common "already exists" path.
 */
@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** For the hourly job: each organization runs in its own tenant context. */
  async runForAllOrganizations(now = new Date()): Promise<number> {
    const organizations = await this.prisma.unscoped.organization.findMany({ select: { id: true } });
    let created = 0;
    for (const { id } of organizations) {
      const store = { requestId: `job_${randomBytes(6).toString('hex')}`, organizationId: id };
      created += await RequestContext.run(store, () => this.runForCurrentOrganization(now));
    }
    if (created > 0) this.logger.log(`Generated ${created} inspection(s).`);
    return created;
  }

  /** Returns how many inspections were created in the current organization. */
  async runForCurrentOrganization(now = new Date()): Promise<number> {
    const db = this.prisma.db;
    const schedules = await db.inspectionSchedule.findMany({ where: { active: true } });
    if (schedules.length === 0) return 0;

    const [templates, assets, sites] = await Promise.all([
      db.inspectionTemplate.findMany({ include: { items: { orderBy: { position: 'asc' } } } }),
      db.asset.findMany(),
      db.site.findMany(),
    ]);

    let created = 0;
    for (const schedule of schedules) {
      const template = templates.find((t) => t.id === schedule.templateId);
      const asset = assets.find((a) => a.id === schedule.assetId);
      const site = asset && sites.find((s) => s.id === asset.siteId);
      if (!template || !asset || !site) continue;

      const dueAt = nextDueAt(schedule.frequency, schedule.timeOfDay, site.timezone, now);
      const exists = await db.inspection.findFirst({ where: { scheduleId: schedule.id, dueAt }, select: { id: true } });
      if (exists) continue;

      try {
        await db.$transaction(async (tx) => {
          const number = await nextNumber(tx, 'inspectionSeq');
          const inspection = await tx.inspection.create({
            data: {
              organizationId: RequestContext.organizationId(),
              number,
              scheduleId: schedule.id,
              assetId: asset.id,
              assigneeId: schedule.assigneeId,
              templateName: template.name,
              dueAt,
            },
          });
          // Template snapshot: copy each prompt so later template edits never rewrite history.
          await tx.inspectionResponse.createMany({
            data: template.items.map((item) => ({
              organizationId: RequestContext.organizationId(),
              inspectionId: inspection.id,
              position: item.position,
              itemPromptSnapshot: item.prompt,
              severity: item.defaultSeverity,
            })),
          });
          await this.audit.record(
            tx,
            {
              entityType: 'inspection',
              entityId: inspection.id,
              action: 'GENERATED',
              message: `INS-${number} generated from schedule (${template.name}, ${asset.name})`,
            },
            null,
          );
        });
        created++;
      } catch (error) {
        // Another run inserted the same (schedule, due_at) between the check and the insert.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    return created;
  }
}
