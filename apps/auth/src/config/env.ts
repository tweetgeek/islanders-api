import { z } from 'zod';
import {
  baseEnvShape,
  durationSchema,
  durationToSeconds,
  parseEnvWith,
  withSwaggerDefault,
} from '@islanders/platform';

/** Surowy JSON; kształt wpisów waliduje moduł, który z nich korzysta (klucze, klienci serwisowi). */
const jsonArray = z.string().transform((text, ctx) => {
  try {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value)) return value as unknown[];
  } catch {
    // niżej wspólny komunikat
  }
  ctx.addIssue({ code: 'custom', message: 'musi być tablicą JSON' });
  return z.NEVER;
});

export const authEnvSchema = z
  .object({
    ...baseEnvShape,
    ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    AUTH_ISSUER: z.url(),
    JWT_SIGNING_KEYS: jsonArray,
    JWT_ACCESS_TTL: durationSchema.default('15m').transform(durationToSeconds),
    JWT_REFRESH_TTL: durationSchema.default('30d').transform(durationToSeconds),
    SERVICE_CLIENTS: z.string().default('[]').pipe(jsonArray),
    WORLD_PROBE_INTERVAL: durationSchema.default('30s').transform(durationToSeconds),
  })
  .transform(withSwaggerDefault);

export type AuthEnv = z.output<typeof authEnvSchema>;

export function parseAuthEnv(raw: Record<string, string | undefined>): AuthEnv {
  return parseEnvWith(authEnvSchema, raw);
}
