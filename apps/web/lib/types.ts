import type { Role, Severity, WorkOrderStatus } from '@inspectra/shared';

export type { Role, Severity, WorkOrderStatus };

export type AssetStatus = 'ACTIVE' | 'OUT_OF_SERVICE' | 'RETIRED';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type InspectionStatus = 'PENDING' | 'SUBMITTED';
export type ResponseResult = 'PASS' | 'FAIL' | 'NA';
export type IssueStatus = 'OPEN' | 'IN_WORK' | 'RESOLVED';

export interface Organization {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Membership {
  userId: string;
  role: Role;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  timezone: string;
}

export interface Asset {
  id: string;
  siteId: string;
  name: string;
  category: string;
  serial: string;
  location: string;
  status: AssetStatus;
}

export interface TemplateItem {
  id: string;
  prompt: string;
  defaultSeverity: Severity;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  items: TemplateItem[];
}

export interface Schedule {
  id: string;
  templateId: string;
  assetId: string;
  frequency: Frequency;
  /** "HH:mm" in the site's timezone. */
  timeOfDay: string;
  assigneeId: string;
  active: boolean;
}

/** Snapshot of the template item taken when the inspection was generated. */
export interface InspectionResponse {
  id: string;
  itemPrompt: string;
  result: ResponseResult | null;
  notes: string;
  severity: Severity;
}

export interface Inspection {
  id: string;
  number: number;
  scheduleId: string;
  templateName: string;
  assetId: string;
  assigneeId: string;
  dueAt: string;
  status: InspectionStatus;
  submittedAt: string | null;
  responses: InspectionResponse[];
}

export interface Issue {
  id: string;
  number: number;
  inspectionId: string;
  responseId: string;
  assetId: string;
  title: string;
  notes: string;
  severity: Severity;
  status: IssueStatus;
  createdAt: string;
}

export interface WorkOrder {
  id: string;
  number: number;
  issueId: string;
  assigneeId: string;
  status: WorkOrderStatus;
  dueAt: string;
  createdAt: string;
}

export type EntityType =
  | 'site'
  | 'asset'
  | 'template'
  | 'schedule'
  | 'inspection'
  | 'issue'
  | 'work_order'
  | 'membership';

export interface AuditEvent {
  id: string;
  actorId: string | null;
  entityType: EntityType;
  entityId: string;
  action: string;
  message: string;
  createdAt: string;
}

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
  counters: { inspection: number; issue: number; workOrder: number };
}
