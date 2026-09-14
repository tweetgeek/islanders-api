import { Redis } from 'ioredis';
import { inject } from 'vitest';
import { jwksCacheKey } from '../src/access/jwks-provider.js';
import { startFakeAuth } from './support/fake-auth.js';
import { createTestApp } from './support/test-app.js';
import { bearer, otherTestKeys, signPlayerToken, testKeys } from './support/tokens.js';

describe('weryfikacja tokenów przez JWKS (e2e)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(inject('redisUrl'));
  });
  afterAll(async () => {
    await redis.quit();
  });

  const jwksFetches = (requests: { path: string }[]) =>
    requests.filter((r) => r.path === '/.well-known/jwks.json').length;

  it('po starcie JWKS z auth leży w Redisie świata z TTL około 7 dni', async () => {
    const t = await createTestApp();
    try {
      const raw = await redis.get(jwksCacheKey(t.slug));
      expect(JSON.parse(raw!).keys.map((k: { kid: string }) => k.kid)).toEqual([testKeys.kid]);
      const ttl = await redis.ttl(jwksCacheKey(t.slug));
      expect(ttl).toBeGreaterThan(604_800 - 60);
      expect(ttl).toBeLessThanOrEqual(604_800);
    } finally {
      await t.close();
    }
  });

  it('nieznany kid wymusza jedno pobranie JWKS; po rotacji w auth token nowym kluczem przechodzi', async () => {
    const t = await createTestApp();
    try {
      const rotated = await signPlayerToken({ keys: otherTestKeys });
      const before = jwksFetches(t.fakeAuth.requests);
      t.fakeAuth.setJwks({ keys: [otherTestKeys.publicJwk, testKeys.publicJwk] });
      await t.http().get('/v1/world').set('Authorization', bearer(rotated.token)).expect(200);
      expect(jwksFetches(t.fakeAuth.requests)).toBe(before + 1);
    } finally {
      await t.close();
    }
  });

  it('zalew nieznanymi kid nie bije w auth częściej niż raz na 30 s', async () => {
    const t = await createTestApp();
    try {
      const unknown = await signPlayerToken({ keys: otherTestKeys });
      const before = jwksFetches(t.fakeAuth.requests);
      for (let i = 0; i < 5; i++) {
        await t.http().get('/v1/world').set('Authorization', bearer(unknown.token)).expect(401);
      }
      expect(jwksFetches(t.fakeAuth.requests)).toBe(before + 1);
    } finally {
      await t.close();
    }
  });

  it('bez kluczy w auth i w Redisie trasa gracza -> 503', async () => {
    const t = await createTestApp();
    await t.close();
    // Nowa aplikacja na tej samej bazie, z auth zwracającym pusty zestaw kluczy i bez wpisu w Redisie.
    const emptyAuth = await startFakeAuth({ jwks: { keys: [] } });
    await redis.del(jwksCacheKey(t.slug));
    const u = await createTestApp({ databaseUrl: t.databaseUrl, fakeAuth: emptyAuth, world: { slug: t.slug } });
    try {
      const p = await signPlayerToken();
      const res = await u.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(503);
      expect(res.body.message).toBe('Usługa kont niedostępna');
    } finally {
      await u.close();
      await emptyAuth.close();
    }
  });
});
