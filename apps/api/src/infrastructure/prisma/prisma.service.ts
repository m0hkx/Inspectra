import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { withTenantScope, type TenantClient } from './tenant';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  /**
   * Unfiltered client. Only for work that is not inside one organization:
   * resolving who is signed in, and the generation job listing organizations.
   */
  readonly unscoped: PrismaClient;

  /** Tenant-scoped client. Everything in a request goes through this. */
  readonly db: TenantClient;

  constructor(config: ConfigService) {
    const adapter = new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') });
    this.unscoped = new PrismaClient({ adapter });
    this.db = withTenantScope(this.unscoped);
  }

  async onModuleDestroy(): Promise<void> {
    await this.unscoped.$disconnect();
  }
}
