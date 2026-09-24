import { z } from 'zod';

/** Body NestJS sends back for every non-2xx response. */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  /** Single message, or one message per failed validation rule. */
  message: z.union([z.string(), z.array(z.string())]),
  error: z.string().optional(),
  path: z.string().optional(),
  timestamp: z.iso.datetime().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
