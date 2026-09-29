import type { PrismaClient } from '../../generated/prisma/client';
import { RequestContext } from '../../common/context/request-context';
import { withTenantScope } from './tenant';

type Args = Record<string, any>;
type Hook = (params: {
  model: string;
  operation: string;
  args: Args;
  query: (args: Args) => Promise<unknown>;
}) => Promise<unknown>;

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

// withTenantScope only calls `$extends`; capture the extension instead of building a client.
const extension = withTenantScope({
  $extends: (ext: unknown) => ext,
} as unknown as PrismaClient) as unknown as {
  query: { $allModels: { $allOperations: Hook } };
};
const hook = extension.query.$allModels.$allOperations;

/** Runs the hook as Prisma would and returns the args it forwarded to the database. */
async function forwarded(
  model: string,
  operation: string,
  args: Args,
  organizationId: string | undefined = ORG,
): Promise<Args> {
  let seen: Args | undefined;
  const query = async (a: Args) => {
    seen = a;
    return null;
  };
  const run = () => hook({ model, operation, args, query });
  await (organizationId
    ? RequestContext.run({ requestId: 'req_test', organizationId }, run)
    : run());
  if (!seen) throw new Error('query was not called');
  return seen;
}

const TENANT_MODELS = [
  'Membership',
  'Site',
  'Asset',
  'InspectionTemplate',
  'TemplateItem',
  'InspectionSchedule',
  'Inspection',
  'InspectionResponse',
  'Issue',
  'WorkOrder',
  'AuditEvent',
];

describe('withTenantScope', () => {
  describe('reads and writes by filter', () => {
    it.each([
      'findUnique',
      'findUniqueOrThrow',
      'findFirst',
      'findFirstOrThrow',
      'findMany',
      'count',
      'aggregate',
      'groupBy',
      'update',
      'updateMany',
      'updateManyAndReturn',
      'delete',
      'deleteMany',
    ])('%s is filtered to the current organization', async (operation) => {
      const args = await forwarded('Site', operation, { where: { name: 'Plant' } });
      expect(args.where).toEqual({ name: 'Plant', organizationId: ORG });
    });

    it('adds the filter when the caller passed no where', async () => {
      expect((await forwarded('Asset', 'findMany', {})).where).toEqual({ organizationId: ORG });
    });

    it.each(TENANT_MODELS)('scopes %s', async (model) => {
      expect((await forwarded(model, 'findFirst', {})).where).toEqual({ organizationId: ORG });
    });

    it('overrides an organizationId the caller put in the filter', async () => {
      const args = await forwarded('WorkOrder', 'findMany', {
        where: { organizationId: OTHER_ORG, status: 'OPEN' },
      });
      expect(args.where).toEqual({ organizationId: ORG, status: 'OPEN' });
    });

    it('keeps nested conditions intact', async () => {
      const where = {
        OR: [{ status: 'OPEN' }, { assigneeId: 'u1' }],
        workOrders: { some: { assigneeId: 'u1' } },
      };
      const args = await forwarded('Issue', 'findMany', { where });
      expect(args.where).toEqual({ ...where, organizationId: ORG });
    });
  });

  describe('inserts', () => {
    it('stamps a created row', async () => {
      const args = await forwarded('Site', 'create', { data: { name: 'Depot' } });
      expect(args.data).toEqual({ name: 'Depot', organizationId: ORG });
      expect(args.where).toBeUndefined();
    });

    it('overrides an organizationId the caller tried to create with', async () => {
      const args = await forwarded('Site', 'create', {
        data: { name: 'Depot', organizationId: OTHER_ORG },
      });
      expect(args.data.organizationId).toBe(ORG);
    });

    it.each(['createMany', 'createManyAndReturn'])('stamps every row of %s', async (operation) => {
      const args = await forwarded('TemplateItem', operation, {
        data: [{ prompt: 'a' }, { prompt: 'b', organizationId: OTHER_ORG }],
      });
      expect(args.data).toEqual([
        { prompt: 'a', organizationId: ORG },
        { prompt: 'b', organizationId: ORG },
      ]);
    });

    it('accepts createMany with a single object', async () => {
      const args = await forwarded('TemplateItem', 'createMany', { data: { prompt: 'a' } });
      expect(args.data).toEqual([{ prompt: 'a', organizationId: ORG }]);
    });

    it('filters and stamps an upsert, leaving its update alone', async () => {
      const args = await forwarded('Membership', 'upsert', {
        where: { id: 'm1' },
        create: { role: 'ADMIN' },
        update: { role: 'ADMIN' },
      });
      expect(args).toEqual({
        where: { id: 'm1', organizationId: ORG },
        create: { role: 'ADMIN', organizationId: ORG },
        update: { role: 'ADMIN' },
      });
    });
  });

  describe('global models', () => {
    it.each(['User', 'Organization'])(
      'passes %s queries through untouched, even outside a tenant',
      async (model) => {
        const args = { where: { email: 'a@b.test' } };
        expect(await forwarded(model, 'findUnique', args, undefined)).toBe(args);
      },
    );
  });

  describe('failing closed', () => {
    it('throws for a tenant model outside an organization context, before touching the database', async () => {
      const query = jest.fn();
      await expect(hook({ model: 'Site', operation: 'findMany', args: {}, query })).rejects.toThrow(
        'Tenant-scoped data access outside an organization context.',
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('throws inside a request context that has no organization yet', async () => {
      const query = jest.fn();
      const run = () => hook({ model: 'Issue', operation: 'create', args: { data: {} }, query });
      await expect(RequestContext.run({ requestId: 'req_test' }, run)).rejects.toThrow(
        'outside an organization context',
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('uses the organization of the context the query runs in, not a neighbour', async () => {
      const [a, b] = await Promise.all([
        forwarded('Site', 'findMany', {}, ORG),
        forwarded('Site', 'findMany', {}, OTHER_ORG),
      ]);
      expect(a.where.organizationId).toBe(ORG);
      expect(b.where.organizationId).toBe(OTHER_ORG);
    });
  });
});
