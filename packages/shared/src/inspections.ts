import { z } from 'zod';

export const inspectionStatusSchema = z.enum(['pending', 'running', 'passed', 'failed']);
export type InspectionStatus = z.infer<typeof inspectionStatusSchema>;

/**
 * Request body of `POST /api/inspections`.
 * Used by the API to validate the incoming payload and by the web app to type
 * the form that produces it.
 */
export const createInspectionSchema = z.object({
  name: z.string().min(1).max(120),
  target: z.url(),
  notes: z.string().max(2000).optional(),
});

export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;

/** A stored inspection, as returned by `GET /api/inspections`. */
export const inspectionSchema = createInspectionSchema.extend({
  id: z.uuid(),
  status: inspectionStatusSchema,
  createdAt: z.iso.datetime(),
});

export type Inspection = z.infer<typeof inspectionSchema>;
