import { Injectable } from '@nestjs/common';
import { can, type Inspection, type submitInspectionSchema } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext, type Actor } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toInspection } from '../common/mappers';
import { nextNumber } from '../common/numbering';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type SubmitData = z.output<typeof submitInspectionSchema>;

const withResponses = { responses: { orderBy: { position: 'asc' } } } as const;

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Admins see every inspection; inspectors see the ones assigned to them. */
  async list(): Promise<Inspection[]> {
    const rows = await this.prisma.db.inspection.findMany({
      where: this.visibleTo(RequestContext.actor()),
      include: withResponses,
      orderBy: { dueAt: 'asc' },
    });
    return rows.map(toInspection);
  }

  async get(id: string): Promise<Inspection> {
    const row = await this.prisma.db.inspection.findFirst({
      where: { id, ...this.visibleTo(RequestContext.actor()) },
      include: withResponses,
    });
    if (!row) throw AppError.notFound('Inspection');
    return toInspection(row);
  }

  /**
   * One transaction: save responses, mark SUBMITTED, open one issue per FAIL, write
   * audit events. Either all of it happens or none of it does.
   */
  submit(id: string, input: SubmitData): Promise<Inspection> {
    const actor = RequestContext.actor();
    return this.prisma.db.$transaction(async (tx) => {
      const inspection = await tx.inspection.findFirst({ where: { id, ...this.visibleTo(actor) }, include: withResponses });
      if (!inspection) throw AppError.notFound('Inspection');
      if (inspection.assigneeId !== actor.userId) throw AppError.forbidden('This inspection is assigned to someone else.');
      if (inspection.status === 'SUBMITTED') {
        throw AppError.conflict('INSPECTION_ALREADY_SUBMITTED', 'This inspection was already submitted.');
      }

      const answers = new Map(input.responses.map((r) => [r.id, r]));
      const unknown = input.responses.some((r) => !inspection.responses.some((existing) => existing.id === r.id));
      if (unknown || inspection.responses.some((r) => !answers.has(r.id))) {
        throw AppError.unprocessable('INSPECTION_INCOMPLETE', 'Answer every item on this checklist before submitting.');
      }

      // Claim the inspection: a concurrent or retried submit finds nothing left to claim.
      const claimed = await tx.inspection.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'SUBMITTED', submittedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw AppError.conflict('INSPECTION_ALREADY_SUBMITTED', 'This inspection was already submitted.');
      }

      for (const response of inspection.responses) {
        const answer = answers.get(response.id)!;
        await tx.inspectionResponse.update({
          where: { id: response.id },
          data: { result: answer.result, notes: answer.notes, severity: answer.severity },
        });
      }

      const failed = inspection.responses.filter((r) => answers.get(r.id)!.result === 'FAIL');
      await this.audit.record(tx, {
        entityType: 'inspection',
        entityId: id,
        action: 'SUBMITTED',
        message: `submitted INS-${inspection.number} (${failed.length} item${failed.length === 1 ? '' : 's'} failed)`,
      });

      for (const response of failed) {
        const answer = answers.get(response.id)!;
        const number = await nextNumber(tx, 'issueSeq');
        // UNIQUE (inspection_response_id) backs this up at the database level.
        const issue = await tx.issue.create({
          data: {
            organizationId: RequestContext.organizationId(),
            number,
            inspectionResponseId: response.id,
            inspectionId: id,
            assetId: inspection.assetId,
            title: response.itemPromptSnapshot,
            notes: answer.notes,
            severity: answer.severity,
          },
        });
        await this.audit.record(tx, {
          entityType: 'issue',
          entityId: issue.id,
          action: 'CREATED',
          message: `ISS-${number} created (${inspection.templateName}, item ${response.position + 1} failed)`,
        });
      }

      const saved = await tx.inspection.findUniqueOrThrow({ where: { id }, include: withResponses });
      return toInspection(saved);
    });
  }

  private visibleTo(actor: Actor): { assigneeId?: string } {
    if (can(actor.role, 'view:all_inspections')) return {};
    if (can(actor.role, 'perform:inspections')) return { assigneeId: actor.userId };
    throw AppError.forbidden("You don't have access to inspections.");
  }
}
