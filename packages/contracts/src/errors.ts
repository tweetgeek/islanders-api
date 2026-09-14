import { z } from 'zod';

export const errorBodySchema = z.object({
  statusCode: z.number().int(),
  error: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]),
  field: z.string().optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
