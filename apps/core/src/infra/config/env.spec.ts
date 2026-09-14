import { parseEnv, EnvValidationError } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('stosuje wartości domyślne', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL).toBe(15 * 60);
    expect(env.JWT_REFRESH_TTL).toBe(30 * 24 * 3600);
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.ISLANDERS_CLIENT_DIR).toBe('../../../islanders');
    expect(env.RATE_LIMIT_AUTH_PER_MINUTE).toBe(10);
    expect(env.RATE_LIMIT_SUBJECT_PER_MINUTE).toBe(120);
    expect(env.RATE_LIMIT_IP_PER_MINUTE).toBe(600);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it('Swagger domyślnie włączony poza produkcją i wyłączony w produkcji', () => {
    expect(parseEnv(base).SWAGGER_ENABLED).toBe(true);
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(
      false,
    );
    expect(
      parseEnv({ ...base, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })
        .SWAGGER_ENABLED,
    ).toBe(true);
    expect(
      parseEnv({ ...base, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED,
    ).toBe(false);
  });

  it('parsuje czasy życia tokenów do sekund', () => {
    const env = parseEnv({
      ...base,
      JWT_ACCESS_TTL: '90s',
      JWT_REFRESH_TTL: '12h',
    });
    expect(env.JWT_ACCESS_TTL).toBe(90);
    expect(env.JWT_REFRESH_TTL).toBe(12 * 3600);
  });

  it('odrzuca brak JWT_SECRET z czytelnym komunikatem', () => {
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(
      EnvValidationError,
    );
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(
      /JWT_SECRET/,
    );
  });

  it('odrzuca za krótki JWT_SECRET i zły format TTL', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(
      /JWT_SECRET/,
    );
    expect(() => parseEnv({ ...base, JWT_ACCESS_TTL: '15 minutes' })).toThrow(
      /JWT_ACCESS_TTL/,
    );
  });

  it('ignoruje zmienne spoza schematu', () => {
    expect(() => parseEnv({ ...base, PATH: '/usr/bin' })).not.toThrow();
  });
});
