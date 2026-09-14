import { z } from 'zod';
import { worldSlugSchema } from '@islanders/contracts';
import { baseEnvShape, parseEnvWith, withSwaggerDefault } from '@islanders/platform';

export { EnvValidationError } from '@islanders/platform';

export const envSchema = z
  .object({
    ...baseEnvShape,
    WORLD_SLUG: worldSlugSchema,
    AUTH_INTERNAL_URL: z.url(),
    AUTH_ISSUER: z.url(),
    ISLANDERS_CLIENT_DIR: z.string().default('../../../islanders'),
    ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3101),
    CORE_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
    PUBLIC_URL: z.url(),
    ADMIN_URL: z.url(),
    AUTH_CLIENT_ID: z.string().min(1),
    AUTH_CLIENT_SECRET: z.string().min(1),
  })
  .transform(withSwaggerDefault);

export type Env = z.output<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return parseEnvWith(envSchema, raw);
}
