import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { siteInputSchema, type Site } from '@inspectra/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SitesService } from './sites.service';

type SiteData = z.output<typeof siteInputSchema>;

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  list(): Promise<Site[]> {
    return this.sites.list();
  }

  @Post()
  @RequirePermission('manage:sites')
  create(@Body(new ZodValidationPipe(siteInputSchema)) input: SiteData): Promise<Site> {
    return this.sites.create(input);
  }

  @Patch(':id')
  @RequirePermission('manage:sites')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(siteInputSchema)) input: SiteData,
  ): Promise<Site> {
    return this.sites.update(id, input);
  }
}
