import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { submitInspectionSchema, type Inspection } from '@inspectra/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspections: InspectionsService) {}

  @Get()
  list(): Promise<Inspection[]> {
    return this.inspections.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Inspection> {
    return this.inspections.get(id);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('perform:inspections')
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitInspectionSchema)) input: z.output<typeof submitInspectionSchema>,
  ): Promise<Inspection> {
    return this.inspections.submit(id, input);
  }
}
