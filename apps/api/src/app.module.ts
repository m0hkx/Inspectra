import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './common/auth/auth.guard';
import { AuthModule } from './common/auth/auth.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { FeaturesModule } from './features.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { QueueModule } from './infrastructure/queue/queue.module';

@Module({
  imports: [
    // Reads `apps/api/.env` locally; in Docker the environment is set by compose.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    FeaturesModule,
    // The hourly job needs Redis; without REDIS_URL (tests) the API runs without it.
    // A function, not the 'REDIS_URL' shorthand: that one only skips when the value is "false".
    ConditionalModule.registerWhen(QueueModule, (env: NodeJS.ProcessEnv) => Boolean(env.REDIS_URL)),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*path');
  }
}
