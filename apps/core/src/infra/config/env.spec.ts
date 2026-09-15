import { EnvValidationError, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders_world_1',
  WORLD_SLUG: 'world-1',
  AUTH_INTERNAL_URL: 'http://auth:3001',
  AUTH_ISSUER: 'https://users.islanders.online',
  PUBLIC_URL: 'https://world-1.islanders.online',
  ADMIN_URL: 'http://core-world-1:3101',
  AUTH_CLIENT_ID: 'core-world-1',
  AUTH_CLIENT_SECRET: 'sekret',
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
    expect(env.ADMIN_PORT).toBe(3101);
    expect(env.CORE_ROLE).toBe('all');
  });

  it('wymaga poprawnego sluga świata i adresów auth', () => {
    expect(() => parseEnv({ ...base, WORLD_SLUG: 'World 1' })).toThrow(/WORLD_SLUG/);
    expect(() => parseEnv({ ...base, AUTH_INTERNAL_URL: 'auth' })).toThrow(/AUTH_INTERNAL_URL/);
    const { AUTH_ISSUER: _drop, ...noIssuer } = base;
    expect(() => parseEnv(noIssuer)).toThrow(EnvValidationError);
  });

  it('odrzuca nieznaną rolę procesu', () => {
    expect(() => parseEnv({ ...base, CORE_ROLE: 'batch' })).toThrow(/CORE_ROLE/);
  });

  it('wymaga niepustego sekretu klienta auth', () => {
    expect(() => parseEnv({ ...base, AUTH_CLIENT_SECRET: '' })).toThrow(/AUTH_CLIENT_SECRET/);
  });

  it('przyjmuje tylko http/https w PUBLIC_URL i ADMIN_URL', () => {
    expect(() => parseEnv({ ...base, PUBLIC_URL: 'ftp://world-1.islanders.online' })).toThrow(/PUBLIC_URL/);
    expect(() => parseEnv({ ...base, ADMIN_URL: 'ftp://core-world-1:3101' })).toThrow(/ADMIN_URL/);
  });

  it('nie zna już sekretów JWT core', () => {
    expect(parseEnv({ ...base, JWT_SECRET: 'x'.repeat(40) })).not.toHaveProperty('JWT_SECRET');
  });
});
