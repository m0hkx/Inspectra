import { Body, Controller, Post } from '@nestjs/common';
import { createOrganizationSchema, type Me } from '@inspectra/shared';
import type { z } from 'zod';
import { IdentityOnly } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @IdentityOnly()
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema))
    input: z.output<typeof createOrganizationSchema>,
  ): Promise<Me> {
    return this.organizations.create(input);
  }
}
