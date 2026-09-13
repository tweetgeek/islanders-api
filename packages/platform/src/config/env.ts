import { z } from 'zod';

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** "15m" -> 900. Akceptuje wyłącznie liczbę całkowitą i jednostkę s, m, h albo d. */
export function durationToSeconds(text: string): number {
  const match = /^(\d+)([smhd])$/.exec(text);
  if (!match) {
    throw new Error(`niepoprawny czas trwania "${text}", użyj np. 15m, 12h, 30d`);
  }
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

export const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'użyj formatu 15m, 12h albo 30d');

/** Wartość dla `app.set('trust proxy', …)`: false, true, liczba przeskoków albo lista podsieci. */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
}

/** Zmienne wspólne dla wszystkich aplikacji; aplikacja rozszerza kształt własnymi polami. */
export const baseEnvShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'musi zaczynać się od postgres://'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_SUBJECT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_IP_PER_MINUTE: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_PREFIX: z.string().min(1).default('rl'),
  TRUST_PROXY: z.string().default('false').transform(parseTrustProxy),
};

/** Swagger domyślnie włączony poza produkcją; jawna wartość zawsze wygrywa. */
export function withSwaggerDefault<
  T extends { NODE_ENV: string; SWAGGER_ENABLED?: 'true' | 'false' },
>(e: T): Omit<T, 'SWAGGER_ENABLED'> & { SWAGGER_ENABLED: boolean } {
  return {
    ...e,
    SWAGGER_ENABLED:
      e.SWAGGER_ENABLED === undefined
        ? e.NODE_ENV !== 'production'
        : e.SWAGGER_ENABLED === 'true',
  };
}

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(
      `Niepoprawna konfiguracja środowiska:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/** Waliduje surowe zmienne środowiskowe. Rzuca EnvValidationError zamiast startować z dziurą w konfiguracji. */
export function parseEnvWith<S extends z.ZodType>(
  schema: S,
  raw: Record<string, string | undefined>,
): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
