import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { InspectionsModule } from './inspections/inspections.module';

@Module({
  imports: [
    // Reads `apps/api/.env` — turbo runs this package with its own folder as cwd.
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    InspectionsModule,
  ],
})
export class AppModule {}
