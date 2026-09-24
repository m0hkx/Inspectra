import { Injectable } from '@nestjs/common';
import type { EntityType } from '@inspectra/shared';
import type { Prisma } from '../generated/prisma/client';
import { RequestContext } from '../common/context/request-context';
import type { TenantTx } from '../infrastructure/prisma/tenant';

export interface AuditEntry {
  entityType: EntityType;
  entityId: string;
  action: string;
  /** Reads as "<actor> <message>" when it starts lowercase, e.g. "moved WO-102 to COMPLETED". */
  message: string;
  /** JSON-serialisable snapshots (the shared response shapes) of the entity around the change. */
  before?: object;
  after?: object;
}

@Injectable()
export class AuditService {
  /**
   * Records an event inside the caller's transaction, never after it: either the
   * change and its audit row both commit, or neither does. `actorId: null` marks a
   * system action (the generation job).
   */
  async record(tx: TenantTx, entry: AuditEntry, actorId: string | null = RequestContext.get()?.actor?.userId ?? null): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: RequestContext.organizationId(),
        actorId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        message: entry.message,
        before: entry.before as Prisma.InputJsonValue | undefined,
        after: entry.after as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
