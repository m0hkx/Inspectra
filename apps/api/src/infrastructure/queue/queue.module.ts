import { BullModule, InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { FeaturesModule } from '../../features.module';
import { GenerationService } from '../../schedules/generation.service';

export const GENERATION_QUEUE = 'inspection-generation';

/**
 * Runs generation hourly rather than once at midnight, so each site's "today" is
 * reached in its own timezone. The worker lives in the API process for the MVP.
 */
@Processor(GENERATION_QUEUE)
export class GenerationProcessor extends WorkerHost {
  constructor(private readonly generation: GenerationService) {
    super();
  }

  async process(): Promise<{ created: number }> {
    return { created: await this.generation.runForAllOrganizations() };
  }
}

@Injectable()
export class GenerationScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(GenerationScheduler.name);

  constructor(@InjectQueue(GENERATION_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    // Upsert, so restarts and multiple instances keep exactly one hourly schedule.
    await this.queue.upsertJobScheduler('hourly-generation', { pattern: '0 * * * *' }, { name: 'generate' });
    // Also catch up once on boot, so a fresh deploy has today's inspections.
    await this.queue.add('generate', {});
    this.logger.log('Hourly inspection generation scheduled.');
  }
}

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
