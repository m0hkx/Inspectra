import { Injectable } from '@nestjs/common';
import type { Site, siteInputSchema } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toSite } from '../common/mappers';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type SiteData = z.output<typeof siteInputSchema>;

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Site[]> {
    const rows = await this.prisma.db.site.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toSite);
  }

  create(input: SiteData): Promise<Site> {
    return this.prisma.db.$transaction(async (tx) => {
      const row = await tx.site.create({ data: { ...input, organizationId: RequestContext.organizationId() } });
      await this.audit.record(tx, { entityType: 'site', entityId: row.id, action: 'CREATED', message: `created site ${row.name}`, after: input });
      return toSite(row);
    });
  }

  update(id: string, input: SiteData): Promise<Site> {
    return this.prisma.db.$transaction(async (tx) => {
      const before = await tx.site.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('Site');
      const row = await tx.site.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        entityType: 'site',
        entityId: id,
        action: 'UPDATED',
        message: `updated site ${row.name}`,
        before: toSite(before),
        after: toSite(row),
      });
      return toSite(row);
    });
  }
}
