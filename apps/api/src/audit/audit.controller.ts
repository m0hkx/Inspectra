import { Controller, Get, Query } from '@nestjs/common';
import { can, entityTypeSchema, type AuditEvent } from '@inspectra/shared';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { RequestContext } from '../common/context/request-context';
import { toAuditEvent } from '../common/mappers';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

const querySchema = z.object({
  entityType: entityTypeSchema.optional(),
  entityId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

@Controller('audit-events')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Newest first. Technicians only see the history of their own work orders and the
   * issues behind them; everyone else sees the organization's log.
   */
  @Get()
  async list(@Query(new ZodValidationPipe(querySchema)) query: z.output<typeof querySchema>): Promise<AuditEvent[]> {
    const actor = RequestContext.actor();
    const db = this.prisma.db;

    const where: Prisma.AuditEventWhereInput = {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };

    if (!can(actor.role, 'view:issues')) {
      const mine = await db.workOrder.findMany({ where: { assigneeId: actor.userId }, select: { id: true, issueId: true } });
      where.OR = [
        { entityType: 'work_order', entityId: { in: mine.map((w) => w.id) } },
        { entityType: 'issue', entityId: { in: mine.map((w) => w.issueId) } },
      ];
    }

    const rows = await db.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: query.limit });
    return rows.map(toAuditEvent);
  }
}
