import { createTestApp } from './support/test-app.js';
import { bearer, signPlayerToken, signToolsToken } from './support/tokens.js';
import { joinWorld } from './support/fixtures.js';

describe('porty i role core (e2e)', () => {
  it('health tylko na porcie wewnętrznym; /admin i /health na publicznym -> 404', async () => {
    const t = await createTestApp();
    try {
      await t.internalHttp().get('/health/live').expect(200);
      const ready = await t.internalHttp().get('/health/ready').expect(200);
      expect(ready.body).toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
      await t.http().get('/health/ready').expect(404);
      await t.http().get('/admin/v1/world').expect(404);
      await t.internalHttp().get('/v1/world').expect(404);
    } finally {
      await t.close();
    }
  });

  it('GET /admin/v1/world: bez tokenu 401, token gracza 401, tools bez admin 403, admin 200', async () => {
    const t = await createTestApp();
    try {
      const p = await signPlayerToken();
      await joinWorld(t, p);
      await t.internalHttp().get('/admin/v1/world').expect(401);
      await t.internalHttp().get('/admin/v1/world').set('Authorization', bearer(p.token)).expect(401);
      await t.internalHttp().get('/admin/v1/world')
        .set('Authorization', bearer(await signToolsToken({ roles: ['player', 'tester'] }))).expect(403);
      const res = await t.internalHttp().get('/admin/v1/world')
        .set('Authorization', bearer(await signToolsToken())).expect(200);
      expect(res.body).toMatchObject({ settings: { slug: t.slug, status: 'OPEN' }, profiles: 1, settlements: 1 });
    } finally {
      await t.close();
    }
  });

  it('rola worker: brak portu publicznego, health działa, API admina nie istnieje', async () => {
    const t = await createTestApp({ env: { CORE_ROLE: 'worker' } });
    try {
      expect(() => t.http()).toThrow(/worker/);
      await t.internalHttp().get('/health/ready').expect(200);
      await t.internalHttp().get('/admin/v1/world')
        .set('Authorization', bearer(await signToolsToken())).expect(404);
    } finally {
      await t.close();
    }
  });
});
