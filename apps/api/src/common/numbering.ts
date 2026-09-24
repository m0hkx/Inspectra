import type { TenantTx } from '../infrastructure/prisma/tenant';
import { RequestContext } from './context/request-context';

type Sequence = 'inspectionSeq' | 'issueSeq' | 'workOrderSeq';

/**
 * Allocates the next human-facing number (INS-1046, ISS-305, WO-104) for the current
 * organization. The row update takes a lock until the transaction ends, so concurrent
 * creators queue instead of colliding, and a rolled-back create returns its number.
 */
export async function nextNumber(tx: TenantTx, sequence: Sequence): Promise<number> {
  const org = await tx.organization.update({
    where: { id: RequestContext.organizationId() },
    data: { [sequence]: { increment: 1 } },
    select: { inspectionSeq: true, issueSeq: true, workOrderSeq: true },
  });
  return org[sequence];
}
