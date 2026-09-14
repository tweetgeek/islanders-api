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
  })
  .transform(withSwaggerDefault);

export type Env = z.output<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return parseEnvWith(envSchema, raw);
}
