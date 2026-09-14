import { EnvValidationError, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders_world_1',
  WORLD_SLUG: 'world-1',
  AUTH_INTERNAL_URL: 'http://auth:3001',
  AUTH_ISSUER: 'https://users.islanders.online',
};

describe('parseEnv (core)', () => {
  it('stosuje wartości domyślne', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_SUBJECT_PER_MINUTE).toBe(120);
    expect(env.RATE_LIMIT_IP_PER_MINUTE).toBe(600);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.ISLANDERS_CLIENT_DIR).toBe('../../../islanders');
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('wymaga poprawnego sluga świata i adresów auth', () => {
    expect(() => parseEnv({ ...base, WORLD_SLUG: 'World 1' })).toThrow(/WORLD_SLUG/);
    expect(() => parseEnv({ ...base, AUTH_INTERNAL_URL: 'auth' })).toThrow(/AUTH_INTERNAL_URL/);
    const { AUTH_ISSUER: _drop, ...noIssuer } = base;
    expect(() => parseEnv(noIssuer)).toThrow(EnvValidationError);
  });

  it('nie zna już sekretów JWT core', () => {
    expect(parseEnv({ ...base, JWT_SECRET: 'x'.repeat(40) })).not.toHaveProperty('JWT_SECRET');
  });
});
