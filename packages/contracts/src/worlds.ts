import { z } from 'zod';
import { worldSlugSchema } from './slug.js';

export const WORLD_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ENDED'] as const;
export const worldStatusSchema = z.enum(WORLD_STATUSES);
export type WorldStatus = z.infer<typeof worldStatusSchema>;

export const worldRegistrationSchema = z.strictObject({
  name: z.string().min(1).max(64),
  publicUrl: z.url(),
  adminUrl: z.url(),
  status: worldStatusSchema,
  isTest: z.boolean(),
});
export type WorldRegistration = z.infer<typeof worldRegistrationSchema>;

export const worldListItemSchema = z.object({
  slug: worldSlugSchema,
  name: z.string(),
  publicUrl: z.url(),
  status: worldStatusSchema.exclude(['DRAFT']),
  isTest: z.boolean(),
  reachable: z.boolean(),
  joined: z.boolean(),
});
export type WorldListItem = z.infer<typeof worldListItemSchema>;
