import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { templateInputSchema, type Template } from '@inspectra/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { TemplatesService } from './templates.service';

type TemplateData = z.output<typeof templateInputSchema>;

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(): Promise<Template[]> {
    return this.templates.list();
  }

  @Post()
  @RequirePermission('manage:templates')
  create(@Body(new ZodValidationPipe(templateInputSchema)) input: TemplateData): Promise<Template> {
    return this.templates.create(input);
  }

  @Put(':id')
  @RequirePermission('manage:templates')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(templateInputSchema)) input: TemplateData,
  ): Promise<Template> {
    return this.templates.update(id, input);
  }
}
