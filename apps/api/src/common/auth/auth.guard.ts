import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { requirePermission, type Action } from '@inspectra/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RequestContext } from '../context/request-context';
import { AppError } from '../errors/app-error';
import { IS_PUBLIC, REQUIRED_ACTIONS } from './decorators';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves who is calling and which organization they act in, then checks the
 * route's required permissions.
 *
 * Identity is the only swappable part: in demo mode the caller names a seeded user
 * in `x-user-id`; with Clerk this becomes "verify the session token, look up the
 * user by `externalId`". Tenancy (membership → organization → role) stays ours.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const userId = this.identify(request);

    const requestedOrg = request.header('x-organization-id');
    const membership = await this.prisma.unscoped.membership.findFirst({
      where: { userId, ...(requestedOrg && UUID.test(requestedOrg) ? { organizationId: requestedOrg } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in as a member of an organization.');

    const store = RequestContext.get();
    if (!store) throw new Error('Request context missing: is RequestIdMiddleware registered?');
    store.actor = { userId, organizationId: membership.organizationId, role: membership.role };
    store.organizationId = membership.organizationId;

    const actions = this.reflector.getAllAndOverride<Action[]>(REQUIRED_ACTIONS, targets) ?? [];
    for (const action of actions) requirePermission(membership.role, action);
    return true;
  }

  private identify(request: Request): string {
    const mode = this.config.get<string>('AUTH_MODE') ?? 'demo';
    if (mode !== 'demo') {
      throw new AppError(401, 'UNAUTHENTICATED', `Auth mode "${mode}" is not configured on this server.`);
    }
    const userId = request.header('x-user-id');
    if (!userId || !UUID.test(userId)) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Choose a demo user to sign in.');
    }
    return userId;
  }
}
