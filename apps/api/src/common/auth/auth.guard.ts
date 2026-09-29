import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { requirePermission, type Action } from '@inspectra/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { RequestContext } from '../context/request-context';
import { AppError } from '../errors/app-error';
import { ClerkService } from './clerk.service';
import { IDENTITY_ONLY, IS_PUBLIC, REQUIRED_ACTIONS } from './decorators';
import { IdentityService } from './identity.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Identity {
  userId: string;
  /** Signed in with a one-click demo login rather than a Clerk session. */
  demo: boolean;
}

/**
 * Resolves who is calling and which organization they act in, then checks the
 * route's required permissions.
 *
 * Identity comes from a Clerk session token (`Authorization: Bearer`) or, for the
 * one-click demo, a seeded user id in `x-user-id`. With AUTH_MODE=demo only the
 * latter exists. Tenancy (membership → organization → role) is always ours.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
    private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const { userId, demo } = await this.identify(request);

    const store = RequestContext.get();
    if (!store) throw new Error('Request context missing: is RequestIdMiddleware registered?');
    store.userId = userId;
    if (this.reflector.getAllAndOverride<boolean>(IDENTITY_ONLY, targets)) return true;

    const requestedOrg = request.header('x-organization-id');
    const membership = await this.prisma.unscoped.membership.findFirst({
      where: {
        userId,
        ...(requestedOrg && UUID.test(requestedOrg) ? { organizationId: requestedOrg } : {}),
        ...(demo && this.clerk.enabled ? { organization: { isDemo: true } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      if (demo)
        throw new AppError(401, 'UNAUTHENTICATED', 'Sign in as a member of an organization.');
      throw new AppError(403, 'NO_ORGANIZATION', "You're not a member of an organization yet.");
    }

    store.actor = { userId, organizationId: membership.organizationId, role: membership.role };
    store.organizationId = membership.organizationId;

    const actions = this.reflector.getAllAndOverride<Action[]>(REQUIRED_ACTIONS, targets) ?? [];
    for (const action of actions) requirePermission(membership.role, action);
    return true;
  }

  private async identify(request: Request): Promise<Identity> {
    const token = request.header('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (token && this.clerk.enabled) {
      return { userId: await this.identity.fromClerkToken(token), demo: false };
    }

    const demoUserId = request.header('x-user-id');
    if (demoUserId) {
      if (!UUID.test(demoUserId))
        throw new AppError(401, 'UNAUTHENTICATED', 'Choose a demo user to sign in.');
      if (this.clerk.enabled && !(await this.identity.isDemoUser(demoUserId))) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Demo sign-in only works for people in the demo organizations.',
        );
      }
      return { userId: demoUserId, demo: true };
    }

    throw new AppError(
      401,
      'UNAUTHENTICATED',
      this.clerk.enabled ? 'Sign in to continue.' : 'Choose a demo user to sign in.',
    );
  }
}
