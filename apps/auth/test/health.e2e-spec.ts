import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: health i zakres portów (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('health/live i health/ready na porcie wewnętrznym', async () => {
    await t.internalHttp().get('/health/live').expect(200, /"status":"ok"/);
    const ready = await t.internalHttp().get('/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('health niedostępny na porcie publicznym', async () => {
    await t.publicHttp().get('/health/ready').expect(404);
  });

  it('nieistniejąca trasa wewnętrzna na porcie publicznym daje to samo 404 co każda inna', async () => {
    const internal = await t.publicHttp().post('/internal/v1/token').send({}).expect(404);
    const missing = await t.publicHttp().post('/nie/istnieje').send({}).expect(404);
    expect(Object.keys(internal.body).sort()).toEqual(Object.keys(missing.body).sort());
  });

  it('zmiana wielkości liter w trasie wewnętrznej nie omija zakresu portu publicznego', async () => {
    await t.publicHttp().post('/INTERNAL/v1/token').send({}).expect(404);
    await t.publicHttp().get('/Health/ready').expect(404);
  });
});
