import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AppError } from '../errors/app-error';
import { ClerkService } from './clerk.service';

/** Maps an authenticated caller to a row in our `users` table. */
@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerk: ClerkService,
  ) {}

  /** Verifies a Clerk session token and returns our user id, linking the account on first sign-in. */
  async fromClerkToken(token: string): Promise<string> {
    const clerkUserId = await this.clerk.verify(token);
    const linked = await this.prisma.unscoped.user.findUnique({
      where: { externalId: clerkUserId },
      select: { id: true },
    });
    if (linked) return linked.id;

    try {
      return await this.link(clerkUserId);
    } catch (error) {
      // Two first requests raced; the other one linked the account.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.unscoped.user.findUnique({
          where: { externalId: clerkUserId },
          select: { id: true },
        });
        if (winner) return winner.id;
      }
      throw error;
    }
  }

  /**
   * Demo logins are one click with no password, so they may only act as seeded demo
   * people: members of a demo organization who never linked a real sign-in.
   */
  async isDemoUser(userId: string): Promise<boolean> {
    const user = await this.prisma.unscoped.user.findFirst({
      where: {
        id: userId,
        externalId: null,
        memberships: { some: { organization: { isDemo: true } } },
      },
      select: { id: true },
    });
    return user !== null;
  }

  /**
   * First sign-in. An invite already created a user with this email, so claim it
   * and the person lands in the organization that invited them. Otherwise create
   * the user; with no membership they are offered to start an organization.
   * Only a verified email may claim, or anyone could sign up as an invitee.
   */
  private async link(clerkUserId: string): Promise<string> {
    const profile = await this.clerk.profile(clerkUserId);
    if (!profile.verifiedEmail) {
      throw AppError.forbidden('Verify the email address on your account, then sign in again.');
    }
    const email = profile.verifiedEmail.toLowerCase();

    return this.prisma.unscoped.$transaction(async (tx) => {
      const invited = await tx.user.findUnique({ where: { email } });
      if (!invited) {
        const created = await tx.user.create({
          data: { externalId: clerkUserId, email, name: profile.name },
        });
        return created.id;
      }
      if (invited.externalId) {
        throw AppError.conflict(
          'CONFLICT',
          'That email address is already linked to another account.',
        );
      }
      await tx.user.update({ where: { id: invited.id }, data: { externalId: clerkUserId } });
      // An invite from inside the public demo doesn't make a real person a demo member.
      await tx.membership.deleteMany({
        where: { userId: invited.id, organization: { isDemo: true } },
      });
      return invited.id;
    });
  }
}
