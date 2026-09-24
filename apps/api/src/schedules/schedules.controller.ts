import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { scheduleInputSchema, type Schedule } from '@inspectra/shared';
import { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { GenerationService } from './generation.service';
import { SchedulesService } from './schedules.service';

type ScheduleData = z.output<typeof scheduleInputSchema>;
const setActiveSchema = z.object({ active: z.boolean() });

@Controller('schedules')
export class SchedulesController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly generation: GenerationService,
  ) {}

  @Get()
  list(): Promise<Schedule[]> {
    return this.schedules.list();
  }

  @Post()
  @RequirePermission('manage:schedules')
  create(@Body(new ZodValidationPipe(scheduleInputSchema)) input: ScheduleData): Promise<Schedule> {
    return this.schedules.create(input);
  }

  @Patch(':id')
  @RequirePermission('manage:schedules')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setActiveSchema)) body: z.output<typeof setActiveSchema>,
  ): Promise<Schedule> {
    return this.schedules.setActive(id, body.active);
  }

  /** Runs the hourly generation now for this organization; safe to call repeatedly. */
  @Post('generate')
  @HttpCode(200)
  @RequirePermission('manage:schedules')
  async generate(): Promise<{ created: number }> {
    return { created: await this.generation.runForCurrentOrganization() };
  }
}
