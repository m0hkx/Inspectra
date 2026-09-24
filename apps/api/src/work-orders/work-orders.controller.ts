import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { transitionWorkOrderSchema, type WorkOrder } from '@inspectra/shared';
import type { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  list(): Promise<WorkOrder[]> {
    return this.workOrders.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<WorkOrder> {
    return this.workOrders.get(id);
  }

  /** Who may perform which move is decided by the shared transition table, not a route permission. */
  @Post(':id/transitions')
  @HttpCode(200)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionWorkOrderSchema)) input: z.output<typeof transitionWorkOrderSchema>,
  ): Promise<WorkOrder> {
    return this.workOrders.transition(id, input);
  }
}
