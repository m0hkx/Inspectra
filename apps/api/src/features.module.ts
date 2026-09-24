import { Module } from '@nestjs/common';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { InspectionsController } from './inspections/inspections.controller';
import { InspectionsService } from './inspections/inspections.service';
import { IssuesController } from './issues/issues.controller';
import { IssuesService } from './issues/issues.service';
import { MeController } from './me/me.controller';
import { MembersController } from './members/members.controller';
import { MembersService } from './members/members.service';
import { GenerationService } from './schedules/generation.service';
import { SchedulesController } from './schedules/schedules.controller';
import { SchedulesService } from './schedules/schedules.service';
import { SitesController } from './sites/sites.controller';
import { SitesService } from './sites/sites.service';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';
import { WorkOrdersController } from './work-orders/work-orders.controller';
import { WorkOrdersService } from './work-orders/work-orders.service';

/** The domain: one folder per resource, registered together. */
@Module({
  controllers: [
    MeController,
    MembersController,
    SitesController,
    AssetsController,
    TemplatesController,
    SchedulesController,
    InspectionsController,
    IssuesController,
    WorkOrdersController,
    AuditController,
  ],
  providers: [
    AuditService,
    MembersService,
    SitesService,
    AssetsService,
    TemplatesService,
    SchedulesService,
    GenerationService,
    InspectionsService,
    IssuesService,
    WorkOrdersService,
  ],
  exports: [GenerationService],
})
export class FeaturesModule {}
