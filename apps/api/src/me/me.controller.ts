import { Controller, Get } from '@nestjs/common';
import type { Me } from '@inspectra/shared';
import { RequestContext } from '../common/context/request-context';
import { PrismaService } from '../infrastructure/prisma/prisma.service';

@Controller()
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

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
}
