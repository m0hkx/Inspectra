// First: sets the environment AppModule reads while it is being imported.
import './env';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import type { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import { resetDatabase } from './database';
import { buildFixture, type Fixture } from './fixture';

export interface TestApp {
  app: INestApplication<App>;
  /** Unscoped client: sees every organization, for arranging and asserting on rows. */
  prisma: PrismaClient;
  /** Ids from the current test's fixture (rebuilt before every test). */
  ids: Fixture;
  http: () => ReturnType<typeof request>;
}

/** Headers of a signed-in demo user. */
export const as = (userId: string, organizationId?: string): Record<string, string> => ({
  'x-user-id': userId,
  ...(organizationId ? { 'x-organization-id': organizationId } : {}),
});

/**
 * Boots the real AppModule once per file (same prefix, CORS, guard and filter as
 * production) and gives every test a freshly truncated database with the fixture.
 *
 * The app listens on an ephemeral port so tests can fire concurrent requests at one
 * server instead of supertest opening a server per request.
 */
export function useTestApp(): TestApp {
  const ctx = { http: () => request(ctx.app.getHttpServer()) } as TestApp;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    ctx.app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
    configureApp(ctx.app);
    await ctx.app.listen(0);
    ctx.prisma = ctx.app.get(PrismaService).unscoped;
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
    ctx.ids = await buildFixture(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app?.close();
  });

  return ctx;
}
