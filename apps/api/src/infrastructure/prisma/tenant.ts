import type { ITXClientDenyList } from '@prisma/client/runtime/client';
import type { PrismaClient } from '../../generated/prisma/client';
import { RequestContext } from '../../common/context/request-context';

/** Models that carry `organizationId`. `Organization` and `User` are global. */
const TENANT_MODELS = new Set([
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
]);

const FILTERED = new Set([
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
  'upsert',
]);

type Args = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

/**
 * Tenancy enforced in the data layer: every query on a tenant model is filtered by,
 * and every insert stamped with, the organization from the request context. Services
 * never add the filter themselves, so no one can forget it.
 *
 * Nested writes bypass query extensions, so tenant children are created with their
 * own `createMany` calls rather than nested `create` blocks.
 */
export function withTenantScope(client: PrismaClient) {
  return client.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const organizationId = RequestContext.organizationId();
          const scoped = args as Args;

          if (FILTERED.has(operation)) {
            scoped.where = { ...scoped.where, organizationId };
          }
          if (operation === 'create') {
            scoped.data = { ...(scoped.data as Record<string, unknown>), organizationId };
          }
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(scoped.data) ? scoped.data : [scoped.data ?? {}];
            scoped.data = rows.map((row) => ({ ...row, organizationId }));
          }
          if (operation === 'upsert') {
            scoped.create = { ...scoped.create, organizationId };
          }
          return query(scoped as typeof args);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof withTenantScope>;

/** The client handed to `db.$transaction(async (tx) => ...)`, still tenant-scoped. */
export type TenantTx = Omit<TenantClient, ITXClientDenyList>;
