import { EnvValidationError } from '@islanders/platform';
import { parseAuthEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders_auth',
  AUTH_ISSUER: 'https://users.islanders.online',
  JWT_SIGNING_KEYS: '[]',
  SERVICE_CLIENTS: '[]',
};

describe('parseAuthEnv', () => {
  it('stosuje wartości domyślne portów, TTL i sondy', () => {
    const env = parseAuthEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.ADMIN_PORT).toBe(3001);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(30 * 24 * 3600);
    expect(env.WORLD_PROBE_INTERVAL).toBe(30);
  });

  it('odrzuca brak AUTH_ISSUER i JWT_SIGNING_KEYS niebędący JSON-em', () => {
    const { AUTH_ISSUER: _drop, ...noIssuer } = base;
    expect(() => parseAuthEnv(noIssuer)).toThrow(/AUTH_ISSUER/);
    expect(() => parseAuthEnv({ ...base, JWT_SIGNING_KEYS: 'nie-json' })).toThrow(EnvValidationError);
  });
});
