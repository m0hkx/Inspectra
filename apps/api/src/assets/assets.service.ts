import { Injectable } from '@nestjs/common';
import type { Asset, assetInputSchema } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toAsset } from '../common/mappers';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { TenantTx } from '../infrastructure/prisma/tenant';

type AssetData = z.output<typeof assetInputSchema>;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Asset[]> {
    const rows = await this.prisma.db.asset.findMany({ orderBy: { name: 'asc' } });
    return rows.map(toAsset);
  }

  async get(id: string): Promise<Asset> {
    const row = await this.prisma.db.asset.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('Asset');
    return toAsset(row);
  }

  create(input: AssetData): Promise<Asset> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.requireSite(tx, input.siteId);
      const row = await tx.asset.create({ data: { ...input, organizationId: RequestContext.organizationId() } });
      await this.audit.record(tx, { entityType: 'asset', entityId: row.id, action: 'CREATED', message: `created asset ${row.name}`, after: toAsset(row) });
      return toAsset(row);
    });
  }

  update(id: string, input: AssetData): Promise<Asset> {
    return this.prisma.db.$transaction(async (tx) => {
      const before = await tx.asset.findUnique({ where: { id } });
      if (!before) throw AppError.notFound('Asset');
      await this.requireSite(tx, input.siteId);
      const row = await tx.asset.update({ where: { id }, data: input });
      await this.audit.record(tx, {
        entityType: 'asset',
        entityId: id,
        action: 'UPDATED',
        message: `updated asset ${row.name}`,
        before: toAsset(before),
        after: toAsset(row),
      });
      return toAsset(row);
    });
  }

  /** A site id from another organization is indistinguishable from a missing one. */
  private async requireSite(tx: TenantTx, siteId: string): Promise<void> {
    const site = await tx.site.findUnique({ where: { id: siteId }, select: { id: true } });
    if (!site) throw AppError.unprocessable('VALIDATION_FAILED', 'Choose a site from this organization.');
  }
}
