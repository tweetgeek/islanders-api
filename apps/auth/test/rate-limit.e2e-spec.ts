import { createTestApp } from './support/test-app.js';

describe('auth: limiter (e2e)', () => {
  it('logowanie: 10 na minutę z adresu, 429 z Retry-After, kubełek wspólny dla dwóch instancji', async () => {
    const env = { RATE_LIMIT_AUTH_PER_MINUTE: '10', RATE_LIMIT_PREFIX: `rl-auth-${Date.now()}` };
    const one = await createTestApp({ env });
    const two = await createTestApp({ env });
    try {
      const body = { email: 'nikt@test.local', password: 'zle-haslo' };
      for (let i = 0; i < 5; i++) {
        await one.publicHttp().post('/v1/auth/login').send(body).expect(401);
        await two.publicHttp().post('/v1/auth/login').send(body).expect(401);
      }
      const limited = await one.publicHttp().post('/v1/auth/login').send(body).expect(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.headers['x-server-time']).toBeDefined();
    } finally {
      await one.close();
      await two.close();
    }
  });
});
