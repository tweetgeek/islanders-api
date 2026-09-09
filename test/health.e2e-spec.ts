import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/test-app.js';

describe('health i swagger (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /api/v1/health -> 200 { status: "ok" }', async () => {
    app = await createTestApp();
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
  });

  it('Swagger JSON dostępny przy SWAGGER_ENABLED=true', async () => {
    app = await createTestApp({ env: { SWAGGER_ENABLED: 'true' } });
    const res = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(res.body.info.title).toBe('Islanders API');
    expect(res.body.paths['/api/v1/health']).toBeDefined();
  });

  it('Swagger wyłączony przy SWAGGER_ENABLED=false', async () => {
    app = await createTestApp({ env: { SWAGGER_ENABLED: 'false' } });
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
  });
});
