import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@inspectra/shared';
import { Public } from '../common/auth/decorators';
import { HealthService } from './health.service';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthResponse {
    return this.healthService.check();
  }
}
