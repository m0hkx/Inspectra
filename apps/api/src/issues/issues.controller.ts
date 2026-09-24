import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { createWorkOrderSchema, type Issue, type WorkOrder } from '@inspectra/shared';
import type { z } from 'zod';
import { RequirePermission } from '../common/auth/decorators';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { IssuesService } from './issues.service';

@Controller('issues')
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get()
  list(): Promise<Issue[]> {
    return this.issues.list();
  }

  @Post(':id/work-orders')
  @RequirePermission('assign:work_orders')
  createWorkOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createWorkOrderSchema)) input: z.output<typeof createWorkOrderSchema>,
  ): Promise<WorkOrder> {
    return this.issues.createWorkOrder(id, input);
  }
}
