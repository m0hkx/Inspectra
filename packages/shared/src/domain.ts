import { z } from 'zod';
import type { Role, Severity, WorkOrderStatus } from './work-orders';

export const assetStatusSchema = z.enum(['ACTIVE', 'OUT_OF_SERVICE', 'RETIRED']);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const frequencySchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export type Frequency = z.infer<typeof frequencySchema>;

export const inspectionStatusSchema = z.enum(['PENDING', 'SUBMITTED']);
export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;

export const responseResultSchema = z.enum(['PASS', 'FAIL', 'NA']);
export type ResponseResult = z.infer<typeof responseResultSchema>;

export const issueStatusSchema = z.enum(['OPEN', 'IN_WORK', 'RESOLVED']);
export type IssueStatus = z.infer<typeof issueStatusSchema>;

export const entityTypeSchema = z.enum([
  'site',
  'asset',
  'template',
  'schedule',
  'inspection',
  'issue',
  'work_order',
  'membership',
]);
export type EntityType = z.infer<typeof entityTypeSchema>;

/*
 * Response shapes of the HTTP API. Dates are ISO-8601 strings in UTC.
 */

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

export interface AuditEvent {
  id: string;
  actorId: string | null;
  entityType: EntityType;
  entityId: string;
  action: string;
  message: string;
  createdAt: string;
}

/** `GET /api/me`: who is signed in, and where. */
export interface Me {
  user: User;
  role: Role;
  organization: Organization;
}

/** `GET /api/members`: people in the organization with their roles. */
export interface Member extends User {
  role: Role;
}
