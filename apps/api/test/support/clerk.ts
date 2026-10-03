import type { ClerkProfile } from '../../src/common/auth/clerk.service';
import { AppError } from '../../src/common/errors/app-error';

/**
 * Stands in for ClerkService, so the suite never calls Clerk. A session token is
 * just `token:<clerk user id>`; anything else is rejected like an expired session.
 * Profiles (read when an account first links) are whatever the test registered.
 */
export class FakeClerk {
  readonly profiles = new Map<string, ClerkProfile>();

  async verify(token: string): Promise<string> {
    const clerkUserId = token.startsWith('token:') ? token.slice('token:'.length) : '';
    if (!clerkUserId)
      throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    return clerkUserId;
  }

  async profile(clerkUserId: string): Promise<ClerkProfile> {
    const profile = this.profiles.get(clerkUserId);
    if (!profile) throw new Error(`No fake Clerk profile registered for ${clerkUserId}.`);
    return profile;
  }
}

/** Headers of a Clerk session for this Clerk user id. */
export const bearer = (clerkUserId: string): Record<string, string> => ({
  authorization: `Bearer token:${clerkUserId}`,
});
