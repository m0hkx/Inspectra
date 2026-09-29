import type { TenantTx } from '../infrastructure/prisma/tenant';
import { RequestContext } from '../common/context/request-context';
import { AuditService } from './audit.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '33333333-3333-4333-8333-333333333333';

describe('AuditService', () => {
  const service = new AuditService();
  const create = jest.fn().mockResolvedValue({});
  const tx = { auditEvent: { create } } as unknown as TenantTx;
  const entry = {
    entityType: 'site' as const,
    entityId: 's1',
    action: 'UPDATED',
    message: 'updated site Plant',
    before: { name: 'A' },
    after: { name: 'B' },
  };

  beforeEach(() => create.mockClear());

  const inRequest = <T>(fn: () => T, actor = true) =>
    RequestContext.run(
      {
        requestId: 'r',
        organizationId: ORG,
        ...(actor ? { actor: { userId: USER, organizationId: ORG, role: 'ADMIN' as const } } : {}),
      },
      fn,
    );

  it('writes through the caller transaction, attributed to the signed-in actor', async () => {
    await inRequest(() => service.record(tx, entry));
    expect(create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG,
        actorId: USER,
        entityType: 'site',
        entityId: 's1',
        action: 'UPDATED',
        message: 'updated site Plant',
        before: { name: 'A' },
        after: { name: 'B' },
      },
    });
  });

  it('records a system action when told the actor is null', async () => {
    await inRequest(() => service.record(tx, entry, null));
    expect(create.mock.calls[0][0].data.actorId).toBeNull();
  });

  it('records no actor for a job that runs without a signed-in user', async () => {
    await inRequest(() => service.record(tx, entry), false);
    expect(create.mock.calls[0][0].data.actorId).toBeNull();
  });

  it('leaves out snapshots that were not given', async () => {
    await inRequest(() =>
      service.record(tx, {
        entityType: 'issue',
        entityId: 'i',
        action: 'RESOLVED',
        message: 'ISS-1 resolved',
      }),
    );
    const { data } = create.mock.calls[0][0];
    expect(data.before).toBeUndefined();
    expect(data.after).toBeUndefined();
  });

  it('refuses to write outside an organization', async () => {
    await expect(service.record(tx, entry)).rejects.toThrow('outside an organization context');
    expect(create).not.toHaveBeenCalled();
  });

  it('propagates a failed write so the surrounding transaction rolls back', async () => {
    create.mockRejectedValueOnce(new Error('connection lost'));
    await expect(inRequest(() => service.record(tx, entry))).rejects.toThrow('connection lost');
  });
});
