import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { assetInputSchema, type Asset } from '@inspectra/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssetsService } from './assets.service';

type AssetData = z.output<typeof assetInputSchema>;

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  list(): Promise<Asset[]> {
    return this.assets.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Asset> {
    return this.assets.get(id);
  }

  @Post()
  @RequirePermission('manage:assets')
  create(@Body(new ZodValidationPipe(assetInputSchema)) input: AssetData): Promise<Asset> {
    return this.assets.create(input);
  }

  @Patch(':id')
  @RequirePermission('manage:assets')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assetInputSchema)) input: AssetData,
  ): Promise<Asset> {
    return this.assets.update(id, input);
  }
}
