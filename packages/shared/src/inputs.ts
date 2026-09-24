import { z } from 'zod';
import { assetStatusSchema, frequencySchema, responseResultSchema } from './domain';
import { roleSchema, severitySchema, workOrderStatusSchema } from './work-orders';

/*
 * Request bodies. The API validates with these; the web app builds its payloads
 * against the same types, so the two cannot drift apart.
 */

const name = z.string().trim().min(1, 'Name is required.').max(120);

export const siteInputSchema = z.object({
  name,
  address: z.string().trim().max(240).default(''),
  timezone: z.string().refine(isTimeZone, 'Unknown timezone.'),
});
export type SiteInput = z.input<typeof siteInputSchema>;

export const assetInputSchema = z.object({
  siteId: z.string().min(1),
  name,
  category: z.string().trim().min(1, 'Category is required.').max(80),
  serial: z.string().trim().max(80).default(''),
  location: z.string().trim().max(160).default(''),
  status: assetStatusSchema.default('ACTIVE'),
});
export type AssetInput = z.input<typeof assetInputSchema>;

export const templateInputSchema = z.object({
  name,
  description: z.string().trim().max(500).default(''),
  items: z
    .array(
      z.object({
        /** Present when editing an existing item; ignored for ordering, which follows the array. */
        id: z.string().optional(),
        prompt: z.string().trim().min(1, 'Every item needs a prompt.').max(300),
        defaultSeverity: severitySchema,
      }),
    )
    .min(1, 'Add at least one checklist item.')
    .max(100),
});
export type TemplateInput = z.input<typeof templateInputSchema>;

export const scheduleInputSchema = z.object({
  templateId: z.string().min(1),
  assetId: z.string().min(1),
  frequency: frequencySchema,
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm, e.g. 09:00.'),
  assigneeId: z.string().min(1),
});
export type ScheduleInput = z.input<typeof scheduleInputSchema>;

export const submitInspectionSchema = z.object({
  responses: z
    .array(
      z.object({
        id: z.string().min(1),
        result: responseResultSchema,
        notes: z.string().trim().max(2000).default(''),
        severity: severitySchema,
      }),
    )
    .min(1),
});
export type SubmitInspectionInput = z.input<typeof submitInspectionSchema>;

export const createWorkOrderSchema = z.object({
  assigneeId: z.string().min(1),
  dueAt: z.iso.datetime({ offset: true }),
});
export type CreateWorkOrderInput = z.input<typeof createWorkOrderSchema>;

export const transitionWorkOrderSchema = z.object({
  to: workOrderStatusSchema,
  reason: z.string().trim().max(1000).optional(),
});
export type TransitionWorkOrderInput = z.input<typeof transitionWorkOrderSchema>;

export const inviteMemberSchema = z.object({
  name,
  email: z.email().max(200),
  role: roleSchema,
});
export type InviteMemberInput = z.input<typeof inviteMemberSchema>;

export const changeRoleSchema = z.object({ role: roleSchema });
export type ChangeRoleInput = z.input<typeof changeRoleSchema>;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
