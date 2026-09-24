import { Injectable } from '@nestjs/common';
import { can, type createWorkOrderSchema, type Issue, type WorkOrder } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toIssue, toWorkOrder } from '../common/mappers';
import { nextNumber } from '../common/numbering';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type CreateWorkOrderData = z.output<typeof createWorkOrderSchema>;

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Admins and inspectors see every issue; technicians see the ones behind their work orders. */
  async list(): Promise<Issue[]> {
    const actor = RequestContext.actor();
    const rows = await this.prisma.db.issue.findMany({
      where: can(actor.role, 'view:issues') ? {} : { workOrders: { some: { assigneeId: actor.userId } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toIssue);
  }

  createWorkOrder(issueId: string, input: CreateWorkOrderData): Promise<WorkOrder> {
    return this.prisma.db.$transaction(async (tx) => {
      const issue = await tx.issue.findUnique({ where: { id: issueId } });
      if (!issue) throw AppError.notFound('Issue');
      if (issue.status !== 'OPEN') {
        throw AppError.conflict('ISSUE_NOT_OPEN', 'Only open issues can get a work order.');
      }

      const assignee = await tx.membership.findFirst({ where: { userId: input.assigneeId }, include: { user: true } });
      if (assignee?.role !== 'TECHNICIAN') {
        throw AppError.unprocessable('VALIDATION_FAILED', 'Work orders must be assigned to a technician in this organization.');
      }

      const claimed = await tx.issue.updateMany({ where: { id: issueId, status: 'OPEN' }, data: { status: 'IN_WORK' } });
      if (claimed.count === 0) throw AppError.conflict('ISSUE_NOT_OPEN', 'Only open issues can get a work order.');

      const number = await nextNumber(tx, 'workOrderSeq');
      const row = await tx.workOrder.create({
        data: {
          organizationId: RequestContext.organizationId(),
          number,
          issueId,
          assigneeId: input.assigneeId,
          dueAt: new Date(input.dueAt),
        },
      });
      await this.audit.record(tx, {
        entityType: 'work_order',
        entityId: row.id,
        action: 'CREATED',
        message: `created WO-${number} from ISS-${issue.number}`,
        after: toWorkOrder(row),
      });
      await this.audit.record(tx, {
        entityType: 'work_order',
        entityId: row.id,
        action: 'ASSIGNED',
        message: `assigned WO-${number} to ${assignee.user.name}`,
      });
      return toWorkOrder(row);
    });
  }
}
