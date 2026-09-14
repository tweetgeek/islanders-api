import { z } from 'zod';

export const worldSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug: małe litery, cyfry i pojedyncze myślniki');
