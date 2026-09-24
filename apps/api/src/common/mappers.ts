import type {
  Asset,
  AuditEvent,
  EntityType,
  Inspection,
  Issue,
  Member,
  Schedule,
  Site,
  Template,
  WorkOrder,
} from '@inspectra/shared';
import type * as Db from '../generated/prisma/client';

/** Database rows → the shared response shapes. Dates become ISO strings here and nowhere else. */

export const toSite = (row: Db.Site): Site => ({
  id: row.id,
  name: row.name,
  address: row.address,
  timezone: row.timezone,
});

export const toAsset = (row: Db.Asset): Asset => ({
  id: row.id,
  siteId: row.siteId,
  name: row.name,
  category: row.category,
  serial: row.serial,
  location: row.location,
  status: row.status,
});

export const toTemplate = (row: Db.InspectionTemplate & { items: Db.TemplateItem[] }): Template => ({
  id: row.id,
  name: row.name,
  description: row.description,
  items: [...row.items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({ id: item.id, prompt: item.prompt, defaultSeverity: item.defaultSeverity })),
});

export const toSchedule = (row: Db.InspectionSchedule): Schedule => ({
  id: row.id,
  templateId: row.templateId,
  assetId: row.assetId,
  frequency: row.frequency,
  timeOfDay: row.timeOfDay,
  assigneeId: row.assigneeId,
  active: row.active,
});

export const toInspection = (row: Db.Inspection & { responses: Db.InspectionResponse[] }): Inspection => ({
  id: row.id,
  number: row.number,
  scheduleId: row.scheduleId,
  templateName: row.templateName,
  assetId: row.assetId,
  assigneeId: row.assigneeId,
  dueAt: row.dueAt.toISOString(),
  status: row.status,
  submittedAt: row.submittedAt?.toISOString() ?? null,
  responses: [...row.responses]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ id: r.id, itemPrompt: r.itemPromptSnapshot, result: r.result, notes: r.notes, severity: r.severity })),
});

export const toIssue = (row: Db.Issue): Issue => ({
  id: row.id,
  number: row.number,
  inspectionId: row.inspectionId,
  responseId: row.inspectionResponseId,
  assetId: row.assetId,
  title: row.title,
  notes: row.notes,
  severity: row.severity,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

export const toWorkOrder = (row: Db.WorkOrder): WorkOrder => ({
  id: row.id,
  number: row.number,
  issueId: row.issueId,
  assigneeId: row.assigneeId,
  status: row.status,
  dueAt: row.dueAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});

export const toAuditEvent = (row: Db.AuditEvent): AuditEvent => ({
  id: row.id,
  actorId: row.actorId,
  entityType: row.entityType as EntityType,
  entityId: row.entityId,
  action: row.action,
  message: row.message,
  createdAt: row.createdAt.toISOString(),
});

export const toMember = (row: Db.Membership & { user: Db.User }): Member => ({
  id: row.user.id,
  name: row.user.name,
  email: row.user.email,
  role: row.role,
});
