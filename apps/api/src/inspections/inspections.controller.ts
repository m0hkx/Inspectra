import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { createInspectionSchema } from '@inspectra/shared';
import type { CreateInspectionInput, Inspection } from '@inspectra/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { InspectionsService } from './inspections.service';

@Controller('inspections')
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Get()
  findAll(): Inspection[] {
    return this.inspectionsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Inspection {
    return this.inspectionsService.findOne(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createInspectionSchema)) input: CreateInspectionInput,
  ): Inspection {
    return this.inspectionsService.create(input);
  }
}
