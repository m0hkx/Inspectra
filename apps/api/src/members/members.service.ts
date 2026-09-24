import { Injectable } from '@nestjs/common';
import type { inviteMemberSchema, Member, Role } from '@inspectra/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { toMember } from '../common/mappers';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

type InviteData = z.output<typeof inviteMemberSchema>;

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Member[]> {
    const rows = await this.prisma.db.membership.findMany({ include: { user: true }, orderBy: { createdAt: 'asc' } });
    return rows.map(toMember);
  }

  /** Adds someone to this organization, creating their user record on first invite. */
  invite(input: InviteData): Promise<Member> {
    return this.prisma.db.$transaction(async (tx) => {
      const email = input.email.toLowerCase();
      const user = (await tx.user.findUnique({ where: { email } })) ?? (await tx.user.create({ data: { name: input.name, email } }));

      const existing = await tx.membership.findFirst({ where: { userId: user.id } });
      if (existing) throw AppError.conflict('CONFLICT', 'Someone with that email is already a member.');

      const membership = await tx.membership.create({
        data: { organizationId: RequestContext.organizationId(), userId: user.id, role: input.role },
        include: { user: true },
      });
      await this.audit.record(tx, {
        entityType: 'membership',
        entityId: user.id,
        action: 'INVITED',
        message: `invited ${user.name} as ${input.role}`,
      });
      return toMember(membership);
    });
  }

  changeRole(userId: string, role: Role): Promise<Member> {
    return this.prisma.db.$transaction(async (tx) => {
      const membership = await tx.membership.findFirst({ where: { userId }, include: { user: true } });
      if (!membership) throw AppError.notFound('Member');

      if (membership.role === 'ADMIN' && role !== 'ADMIN') {
        const admins = await tx.membership.count({ where: { role: 'ADMIN' } });
        if (admins === 1) throw AppError.conflict('LAST_ADMIN', 'An organization needs at least one admin.');
      }

      const updated = await tx.membership.update({ where: { id: membership.id }, data: { role }, include: { user: true } });
      await this.audit.record(tx, {
        entityType: 'membership',
        entityId: userId,
        action: 'ROLE_CHANGED',
        message: `changed ${membership.user.name}'s role to ${role}`,
        before: { role: membership.role },
        after: { role },
      });
      return toMember(updated);
    });
  }
}
