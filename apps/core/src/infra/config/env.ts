import { z } from 'zod';
import {
  baseEnvShape,
  durationSchema,
  durationToSeconds,
  parseEnvWith,
  withSwaggerDefault,
} from '@islanders/platform';

export { EnvValidationError, durationToSeconds } from '@islanders/platform';

export const envSchema = z
  .object({
    ...baseEnvShape,
    JWT_SECRET: z.string().min(32, 'co najmniej 32 znaki'),
    JWT_ACCESS_TTL: durationSchema.default('15m').transform(durationToSeconds),
    JWT_REFRESH_TTL: durationSchema.default('30d').transform(durationToSeconds),
    ISLANDERS_CLIENT_DIR: z.string().default('../../../islanders'),
    SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .transform(withSwaggerDefault);

export type Env = z.output<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return parseEnvWith(envSchema, raw);
}
