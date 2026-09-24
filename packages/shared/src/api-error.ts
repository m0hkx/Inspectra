import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INSPECTION_ALREADY_SUBMITTED',
  'INSPECTION_INCOMPLETE',
  'WORK_ORDER_INVALID_TRANSITION',
  'WORK_ORDER_REASON_REQUIRED',
  'ISSUE_NOT_OPEN',
  'LAST_ADMIN',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Body of every non-2xx API response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    /** One entry per failed field, for VALIDATION_FAILED. */
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
