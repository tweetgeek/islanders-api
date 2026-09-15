import { randomUUID } from 'node:crypto';
import { FixedClock } from '@islanders/domain/time';
import { joinWorld } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('warstwa HTTP core (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-14T12:00:00.000Z'));

  beforeAll(async () => {
    // Limit gracza obniżony do 5, żeby test kolejności strażników nie musiał słać 121 żądań.
    t = await createTestApp({ clock, env: { RATE_LIMIT_SUBJECT_PER_MINUTE: '5' } });
  });
  afterAll(async () => {
    await t.close();
  });

  it('X-Server-Time na każdej odpowiedzi, także 404 i 401; serverTime w obiektach, nie w tablicach', async () => {
    const notFound = await t.http().get('/nie-ma').expect(404);
    expect(notFound.headers['x-server-time']).toBe('2026-09-14T12:00:00.000Z');
    const unauthorized = await t.http().get('/v1/world').expect(401);
    expect(unauthorized.headers['x-server-time']).toBe('2026-09-14T12:00:00.000Z');

    const p = await signPlayerToken();
    const joined = await joinWorld(t, p);
    expect(joined.serverTime).toBe('2026-09-14T12:00:00.000Z');
    const list = await t.http().get('/v1/settlements').set('Authorization', bearer(p.token)).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
  });

  it('koperta błędów Nest dla 400', async () => {
    const p = await signPlayerToken();
    const res = await t.http().post('/v1/join').set('Authorization', bearer(p.token)).send({ name: 42 }).expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  // Pilnuje kolejności strażników w AccessModule: RateLimitGuard musi działać PO PlayerTokenGuard.
  it('trasa gracza limitowana po graczu, nie po adresie', async () => {
    const a = await signPlayerToken();
    const b = await signPlayerToken();
    for (let i = 0; i < 5; i++) {
      await t.http().get('/v1/world').set('Authorization', bearer(a.token)).expect(200);
    }
    const limited = await t.http().get('/v1/world').set('Authorization', bearer(a.token)).expect(429);
    expect(limited.body.message).toMatch(/Za dużo żądań/);
    expect(limited.headers['retry-after']).toBeDefined();
    await t.http().get('/v1/world').set('Authorization', bearer(b.token)).expect(200);
  });

  it('zalew złymi tokenami zużywa sufit po adresie, zanim zadziała strażnik tokenu', async () => {
    const flood = await createTestApp({ env: { RATE_LIMIT_IP_PER_MINUTE: '3' } });
    try {
      for (let i = 0; i < 3; i++) {
        await flood.http().get('/v1/world').set('Authorization', 'Bearer zly.token.jwt').expect(401);
      }
      const limited = await flood.http().get('/v1/world').set('Authorization', 'Bearer zly.token.jwt').expect(429);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      await flood.close();
    }
  });

  it('dwie instancje na tym samym Redisie i prefiksie dzielą kubełek po adresie', async () => {
    const shared = { RATE_LIMIT_IP_PER_MINUTE: '2', RATE_LIMIT_PREFIX: `rl-shared-${randomUUID()}` };
    const one = await createTestApp({ env: shared });
    const two = await createTestApp({ env: shared });
    try {
      await one.http().get('/v1/world').expect(401);
      await two.http().get('/v1/world').expect(401);
      await one.http().get('/v1/world').expect(429);
    } finally {
      await one.close();
      await two.close();
    }
  });

  it('TRUST_PROXY=1: różne X-Forwarded-For to różne kubełki po adresie', async () => {
    const proxied = await createTestApp({ env: { RATE_LIMIT_IP_PER_MINUTE: '1', TRUST_PROXY: '1' } });
    try {
      const hit = (ip: string) => proxied.http().get('/v1/world').set('X-Forwarded-For', ip);
      await hit('203.0.113.1').expect(401);
      await hit('203.0.113.1').expect(429);
      await hit('203.0.113.2').expect(401);
    } finally {
      await proxied.close();
    }
  });

  it('Swagger pod /docs-json przy SWAGGER_ENABLED=true, wyłączony przy false', async () => {
    const on = await createTestApp({ env: { SWAGGER_ENABLED: 'true' } });
    const off = await createTestApp({ env: { SWAGGER_ENABLED: 'false' } });
    try {
      const res = await on.http().get('/docs-json').expect(200);
      expect(res.body.info.title).toBe('Islanders World');
      expect(res.body.paths['/v1/world']).toBeDefined();
      await off.http().get('/docs-json').expect(404);
    } finally {
      await on.close();
      await off.close();
    }
  });
});
