import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@inspectra/shared';

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();
  private readonly version = process.env.npm_package_version ?? '0.1.0';

  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'inspectra-api',
      version: this.version,
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
