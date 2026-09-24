import { Injectable } from '@nestjs/common';
import type { Schedule, scheduleInputSchema } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toSchedule } from '../common/mappers';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type ScheduleData = z.output<typeof scheduleInputSchema>;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Schedule[]> {
    const rows = await this.prisma.db.inspectionSchedule.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(toSchedule);
  }

  create(input: ScheduleData): Promise<Schedule> {
    return this.prisma.db.$transaction(async (tx) => {
      const [template, asset, assignee] = await Promise.all([
        tx.inspectionTemplate.findUnique({ where: { id: input.templateId }, select: { name: true } }),
        tx.asset.findUnique({ where: { id: input.assetId }, select: { name: true } }),
        tx.membership.findFirst({ where: { userId: input.assigneeId }, select: { role: true } }),
      ]);
      if (!template) throw AppError.unprocessable('VALIDATION_FAILED', 'Choose a template from this organization.');
      if (!asset) throw AppError.unprocessable('VALIDATION_FAILED', 'Choose an asset from this organization.');
      if (assignee?.role !== 'INSPECTOR') {
        throw AppError.unprocessable('VALIDATION_FAILED', 'Schedules must be assigned to an inspector in this organization.');
      }

      const row = await tx.inspectionSchedule.create({ data: { ...input, organizationId: RequestContext.organizationId() } });
      await this.audit.record(tx, {
        entityType: 'schedule',
        entityId: row.id,
        action: 'CREATED',
        message: `scheduled ${template.name} for ${asset.name}`,
        after: toSchedule(row),
      });
      return toSchedule(row);
    });
  }

  setActive(id: string, active: boolean): Promise<Schedule> {
    return this.prisma.db.$transaction(async (tx) => {
      const before = await tx.inspectionSchedule.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('Schedule');
      const row = await tx.inspectionSchedule.update({ where: { id }, data: { active } });
      await this.audit.record(tx, {
        entityType: 'schedule',
        entityId: id,
        action: active ? 'ACTIVATED' : 'PAUSED',
        message: `${active ? 'resumed' : 'paused'} a schedule`,
        before: toSchedule(before),
        after: toSchedule(row),
      });
      return toSchedule(row);
    });
  }
}
