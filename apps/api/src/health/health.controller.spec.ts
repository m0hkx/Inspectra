import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { healthResponseSchema } from '@inspectra/shared';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns a payload matching the shared contract', () => {
    const result = healthResponseSchema.safeParse(controller.check());

    expect(result.success).toBe(true);
  });
});
