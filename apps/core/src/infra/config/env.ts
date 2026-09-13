import { z } from 'zod';

const DURATION_UNITS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/** "15m" -> 900. Akceptuje wyłącznie liczbę całkowitą i jednostkę s, m, h albo d. */
export function durationToSeconds(text: string): number {
  const match = /^(\d+)([smhd])$/.exec(text);
  if (!match) {
    throw new Error(
      `niepoprawny czas trwania "${text}", użyj np. 15m, 12h, 30d`,
    );
  }
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'użyj formatu 15m, 12h albo 30d');

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'musi zaczynać się od postgres://'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32, 'co najmniej 32 znaki'),
    JWT_ACCESS_TTL: duration.default('15m').transform(durationToSeconds),
    JWT_REFRESH_TTL: duration.default('30d').transform(durationToSeconds),
    ISLANDERS_CLIENT_DIR: z.string().default('../../../islanders'),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_PLAYER_PER_MINUTE: z.coerce.number().int().min(1).default(120),
    SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .transform((e) => ({
    ...e,
    SWAGGER_ENABLED:
      e.SWAGGER_ENABLED === undefined
        ? e.NODE_ENV !== 'production'
        : e.SWAGGER_ENABLED === 'true',
  }));

export type Env = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(
      `Niepoprawna konfiguracja środowiska:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/** Waliduje surowe zmienne środowiskowe. Rzuca EnvValidationError zamiast startować z dziurą w konfiguracji. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new EnvValidationError(issues);
  }
  return result.data;
}
