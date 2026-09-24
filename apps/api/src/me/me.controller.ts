import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Me, Role } from '@inspectra/shared';
import { Public } from '../common/auth/decorators';
import { RequestContext } from '../common/context/request-context';
import { AppError } from '../common/errors/app-error';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationName: string;
}

@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  async me(): Promise<Me> {
    const actor = RequestContext.actor();
    const [user, organization] = await Promise.all([
      this.prisma.unscoped.user.findUniqueOrThrow({ where: { id: actor.userId } }),
      this.prisma.unscoped.organization.findUniqueOrThrow({ where: { id: actor.organizationId } }),
    ]);
    return {
      user: { id: user.id, name: user.name, email: user.email },
      role: actor.role,
      organization: { id: organization.id, name: organization.name },
    };
  }

  /** The one-click demo logins. Only exists while AUTH_MODE=demo. */
  @Public()
  @Get('auth/demo-users')
  async demoUsers(): Promise<DemoUser[]> {
    if ((this.config.get<string>('AUTH_MODE') ?? 'demo') !== 'demo') throw AppError.notFound('Route');
    const memberships = await this.prisma.unscoped.membership.findMany({
      include: { user: true, organization: true },
      orderBy: [{ organization: { name: 'asc' } }, { createdAt: 'asc' }],
    });
    return memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      organizationName: m.organization.name,
    }));
  }
}
