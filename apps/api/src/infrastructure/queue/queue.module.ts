import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeaturesModule } from '../../features.module';
import { GENERATION_QUEUE, GenerationProcessor, GenerationScheduler } from './queue.service';

@Module({
  imports: [
    FeaturesModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL'), maxRetriesPerRequest: null },
      }),
    }),
    BullModule.registerQueue({
      name: GENERATION_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  providers: [GenerationProcessor, GenerationScheduler],
})
export class QueueModule {}
