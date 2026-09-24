import { Injectable } from '@nestjs/common';
import { assertTransition, can, type transitionWorkOrderSchema, type WorkOrder } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext, type Actor } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toWorkOrder } from '../common/mappers';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type TransitionData = z.output<typeof transitionWorkOrderSchema>;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Technicians only ever see work orders assigned to them. */
  async list(): Promise<WorkOrder[]> {
    const rows = await this.prisma.db.workOrder.findMany({
      where: this.visibleTo(RequestContext.actor()),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWorkOrder);
  }

  async get(id: string): Promise<WorkOrder> {
    const row = await this.prisma.db.workOrder.findFirst({ where: { id, ...this.visibleTo(RequestContext.actor()) } });
    if (!row) throw AppError.notFound('Work order');
    return toWorkOrder(row);
  }

  /**
   * Applies one row of the shared transition table. Invalid moves fail with
   * WORK_ORDER_INVALID_TRANSITION; reaching VERIFIED resolves the issue in the same
   * transaction.
   */
  transition(id: string, input: TransitionData): Promise<WorkOrder> {
    const actor = RequestContext.actor();
    return this.prisma.db.$transaction(async (tx) => {
      const wo = await tx.workOrder.findFirst({ where: { id, ...this.visibleTo(actor) } });
      if (!wo) throw AppError.notFound('Work order');

      const transition = assertTransition(wo.status, input.to, { userId: actor.userId, role: actor.role }, wo.assigneeId);
      const reason = input.reason?.trim();
      if (transition.requiresReason && !reason) {
        throw AppError.unprocessable('WORK_ORDER_REASON_REQUIRED', 'Give a reason when sending work back to the technician.');
      }

      // Only move from the status we validated against; a concurrent change loses cleanly.
      const moved = await tx.workOrder.updateMany({ where: { id, status: wo.status }, data: { status: input.to } });
      if (moved.count === 0) throw AppError.conflict('CONFLICT', 'This work order just changed. Reload and try again.');

      const issue = await tx.issue.findUniqueOrThrow({ where: { id: wo.issueId } });
      if (input.to === 'VERIFIED') await tx.issue.update({ where: { id: issue.id }, data: { status: 'RESOLVED' } });
      if (input.to === 'CANCELLED') await tx.issue.update({ where: { id: issue.id }, data: { status: 'OPEN' } });

      const label = `WO-${wo.number}`;
      const rejected = wo.status === 'COMPLETED' && input.to === 'IN_PROGRESS';
      await this.audit.record(tx, {
        entityType: 'work_order',
        entityId: id,
        action: rejected ? 'REJECTED' : input.to,
        message: rejected ? `rejected ${label}: "${reason}"` : `moved ${label} to ${input.to}`,
        before: { status: wo.status },
        after: { status: input.to, ...(reason ? { reason } : {}) },
      });
      if (input.to === 'VERIFIED') {
        await this.audit.record(tx, { entityType: 'issue', entityId: issue.id, action: 'RESOLVED', message: `ISS-${issue.number} resolved` });
      }

      const saved = await tx.workOrder.findUniqueOrThrow({ where: { id } });
      return toWorkOrder(saved);
    });
  }

  private visibleTo(actor: Actor): { assigneeId?: string } {
    return can(actor.role, 'view:all_work_orders') ? {} : { assigneeId: actor.userId };
  }
}
