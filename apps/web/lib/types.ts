import type {
  AuditEvent,
  Asset,
  Inspection,
  Issue,
  Membership,
  Organization,
  Schedule,
  Site,
  Template,
  User,
  WorkOrder,
} from '@inspectra/shared';

export type {
  Asset,
  AssetStatus,
  AuditEvent,
  EntityType,
  Frequency,
  Inspection,
  InspectionResponse,
  InspectionStatus,
  Issue,
  IssueStatus,
  Membership,
  Organization,
  ResponseResult,
  Role,
  Schedule,
  Severity,
  Site,
  Template,
  TemplateItem,
  User,
  WorkOrder,
  WorkOrderStatus,
} from '@inspectra/shared';

/** Everything the signed-in user may see in their organization, loaded from the API. */
export interface Db {
  organization: Organization;
  users: User[];
  memberships: Membership[];
  sites: Site[];
  assets: Asset[];
  templates: Template[];
  schedules: Schedule[];
  inspections: Inspection[];
  issues: Issue[];
  workOrders: WorkOrder[];
  auditEvents: AuditEvent[];
}
