import { Injectable } from '@nestjs/common';
import type { createOrganizationSchema, Me } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type CreateData = z.output<typeof createOrganizationSchema>;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Onboarding: someone signed in with no membership starts an organization as its admin. */
  async create(input: CreateData): Promise<Me> {
    const userId = RequestContext.userId();
    // One organization per person for now, the same rule inviting enforces.
    if (await this.prisma.unscoped.membership.findFirst({ where: { userId } })) {
      throw AppError.conflict('CONFLICT', 'You already belong to an organization.');
    }

    return this.prisma.db.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: input.name } });
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

      // From here on the request acts inside the new organization.
      const store = RequestContext.get()!;
      store.organizationId = organization.id;
      store.actor = { userId, organizationId: organization.id, role: 'ADMIN' };

      await tx.membership.create({
        data: { organizationId: organization.id, userId, role: 'ADMIN' },
      });
      await this.audit.record(tx, {
        entityType: 'membership',
        entityId: userId,
        action: 'ORGANIZATION_CREATED',
        message: `created ${organization.name}`,
      });
      return {
        user: { id: user.id, name: user.name, email: user.email },
        role: 'ADMIN',
        organization: { id: organization.id, name: organization.name },
      };
    });
  }
}
