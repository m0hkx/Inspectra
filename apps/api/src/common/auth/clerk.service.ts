import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken, type ClerkClient } from '@clerk/backend';
import { AppError } from '../errors/app-error';

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
  private readonly secretKey: string;
  private readonly jwtKey?: string;
  private readonly authorizedParties: string[];
  private client?: ClerkClient;

  constructor(config: ConfigService) {
    const secretKey = config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set: sign-in needs Clerk.');
    // A publishable key here starts fine, then rejects every session token.
    if (!secretKey.startsWith('sk_'))
      throw new Error('CLERK_SECRET_KEY must be the secret key (sk_...), not the publishable key.');
    this.secretKey = secretKey;
    this.jwtKey = config.get<string>('CLERK_JWT_KEY') || undefined;

    // Tokens minted for any other site are rejected, even if Clerk signed them.
    this.authorizedParties = (config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
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
