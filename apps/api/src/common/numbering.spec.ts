import type { TenantTx } from '../infrastructure/prisma/tenant';
import { RequestContext } from './context/request-context';
import { nextNumber } from './numbering';

const ORG = '11111111-1111-4111-8111-111111111111';

function fakeTx() {
  const update = jest
    .fn()
    .mockResolvedValue({ inspectionSeq: 1046, issueSeq: 305, workOrderSeq: 104 });
  return { tx: { organization: { update } } as unknown as TenantTx, update };
}

describe('nextNumber', () => {
  it.each([
    ['inspectionSeq', 1046],
    ['issueSeq', 305],
    ['workOrderSeq', 104],
  ] as const)(
    'increments %s on the current organization and returns the new value',
    async (sequence, expected) => {
      const { tx, update } = fakeTx();
      const number = await RequestContext.run({ requestId: 'r', organizationId: ORG }, () =>
        nextNumber(tx, sequence),
      );
      expect(number).toBe(expected);
      expect(update).toHaveBeenCalledWith({
        where: { id: ORG },
        data: { [sequence]: { increment: 1 } },
        select: { inspectionSeq: true, issueSeq: true, workOrderSeq: true },
      });
    },
  );

  it('refuses to allocate outside an organization context', async () => {
    const { tx, update } = fakeTx();
    await expect(nextNumber(tx, 'issueSeq')).rejects.toThrow('outside an organization context');
    expect(update).not.toHaveBeenCalled();
  });
});
