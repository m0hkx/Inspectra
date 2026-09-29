import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { AppError } from '../errors/app-error';

export type AuthMode = 'demo' | 'clerk';

export interface ClerkProfile {
  name: string;
  /** Primary email, only when Clerk has verified it. */
  verifiedEmail: string | null;
}

/**
 * The only file that talks to Clerk. Clerk answers "who is this person"; everything
 * after that (users, memberships, roles) is our own data. Tests replace this
 * provider with a fake, so nothing else needs Clerk to be reachable.
 */
@Injectable()
export class ClerkService {
  readonly mode: AuthMode;
  private readonly secretKey?: string;
  private readonly jwtKey?: string;
  private readonly authorizedParties: string[];
  private client?: ClerkClient;

  constructor(config: ConfigService) {
    const mode = config.get<string>('AUTH_MODE') ?? 'demo';
    if (mode !== 'demo' && mode !== 'clerk')
      throw new Error(`AUTH_MODE must be "demo" or "clerk", got "${mode}".`);
    this.mode = mode;

    this.secretKey = config.get<string>('CLERK_SECRET_KEY') || undefined;
    this.jwtKey = config.get<string>('CLERK_JWT_KEY') || undefined;
    if (mode === 'clerk' && !this.secretKey)
      throw new Error('AUTH_MODE=clerk needs CLERK_SECRET_KEY.');

    // Tokens minted for any other site are rejected, even if Clerk signed them.
    this.authorizedParties = (config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get enabled(): boolean {
    return this.mode === 'clerk';
  }

  /** Verifies a session token and returns the Clerk user id (`sub`). */
  async verify(token: string): Promise<string> {
    try {
      const payload = await verifyToken(token, {
        secretKey: this.secretKey,
        jwtKey: this.jwtKey,
        authorizedParties: this.authorizedParties,
      });
      return payload.sub;
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    }
  }

  /** Name and verified email, read once when a Clerk user first reaches the API. */
  async profile(clerkUserId: string): Promise<ClerkProfile> {
    this.client ??= createClerkClient({ secretKey: this.secretKey });
    const user = await this.client.users.getUser(clerkUserId);
    const primary = user.primaryEmailAddress;
    const verifiedEmail =
      primary?.verification?.status === 'verified' ? primary.emailAddress : null;
    const name =
      user.fullName?.trim() || user.username || verifiedEmail?.split('@')[0] || 'New user';
    return { name, verifiedEmail };
  }
}
