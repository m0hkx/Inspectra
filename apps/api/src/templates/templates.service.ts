import { Injectable } from '@nestjs/common';
import type { Template, templateInputSchema } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toTemplate } from '../common/mappers';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { TenantTx } from '../infrastructure/prisma/tenant';

type TemplateData = z.output<typeof templateInputSchema>;

const withItems = { items: { orderBy: { position: 'asc' } } } as const;

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Template[]> {
    const rows = await this.prisma.db.inspectionTemplate.findMany({ include: withItems, orderBy: { name: 'asc' } });
    return rows.map(toTemplate);
  }

  create(input: TemplateData): Promise<Template> {
    return this.prisma.db.$transaction(async (tx) => {
      const row = await tx.inspectionTemplate.create({
        data: { organizationId: RequestContext.organizationId(), name: input.name, description: input.description },
      });
      await this.writeItems(tx, row.id, input.items);
      const saved = await this.load(tx, row.id);
      await this.audit.record(tx, { entityType: 'template', entityId: row.id, action: 'CREATED', message: `created template ${row.name}`, after: saved });
      return saved;
    });
  }

  /**
   * Replaces the checklist. Safe because inspections copy each prompt when they are
   * generated: last month's inspections keep showing what was actually asked.
   */
  update(id: string, input: TemplateData): Promise<Template> {
    return this.prisma.db.$transaction(async (tx) => {
      const before = await tx.inspectionTemplate.findUnique({ where: { id }, include: withItems });
      if (!before) throw AppError.notFound('Template');
      await tx.inspectionTemplate.update({ where: { id }, data: { name: input.name, description: input.description } });
      await tx.templateItem.deleteMany({ where: { templateId: id } });
      await this.writeItems(tx, id, input.items);
      const saved = await this.load(tx, id);
      await this.audit.record(tx, {
        entityType: 'template',
        entityId: id,
        action: 'UPDATED',
        message: `updated template ${saved.name}`,
        before: toTemplate(before),
        after: saved,
      });
      return saved;
    });
  }

  private async writeItems(tx: TenantTx, templateId: string, items: TemplateData['items']): Promise<void> {
    await tx.templateItem.createMany({
      data: items.map((item, position) => ({
        organizationId: RequestContext.organizationId(),
        templateId,
        position,
        prompt: item.prompt,
        defaultSeverity: item.defaultSeverity,
      })),
    });
  }

  private async load(tx: TenantTx, id: string): Promise<Template> {
    const row = await tx.inspectionTemplate.findUniqueOrThrow({ where: { id }, include: withItems });
    return toTemplate(row);
  }
}
