import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { requirePermission, type Action } from '@inspectra/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RequestContext } from '../context/request-context';
import { AppError } from '../errors/app-error';
import { IDENTITY_ONLY, IS_PUBLIC, REQUIRED_ACTIONS } from './decorators';
import { IdentityService } from './identity.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves who is calling and which organization they act in, then checks the
 * route's required permissions.
 *
 * Identity comes from a Clerk session token (`Authorization: Bearer`). Tenancy
 * (membership → organization → role) is always ours.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const userId = await this.identity.fromClerkToken(token);

    const store = RequestContext.get();
    if (!store) throw new Error('Request context missing: is RequestIdMiddleware registered?');
    store.userId = userId;
    if (this.reflector.getAllAndOverride<boolean>(IDENTITY_ONLY, targets)) return true;

    const requestedOrg = request.header('x-organization-id');
    const membership = await this.prisma.unscoped.membership.findFirst({
      where: {
        userId,
        ...(requestedOrg && UUID.test(requestedOrg) ? { organizationId: requestedOrg } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      throw new AppError(403, 'NO_ORGANIZATION', "You're not a member of an organization yet.");
    }

    store.actor = { userId, organizationId: membership.organizationId, role: membership.role };
    store.organizationId = membership.organizationId;

    const actions = this.reflector.getAllAndOverride<Action[]>(REQUIRED_ACTIONS, targets) ?? [];
    for (const action of actions) requirePermission(membership.role, action);
    return true;
  }
}
