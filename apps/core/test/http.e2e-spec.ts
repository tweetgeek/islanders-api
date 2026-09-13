import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FixedClock } from '@islanders/domain/time';
import {
  bearer,
  createWorld,
  joinWorld,
  registerPlayer,
} from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('warstwa HTTP (e2e)', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    // Limit auth produkcyjny (10/min), w przeciwieństwie do domyślnego środowiska testowego.
    // Limit gracza obniżony do 5, żeby test kolejności strażników nie musiał słać 121 żądań.
    app = await createTestApp({
      clock,
      env: {
        RATE_LIMIT_AUTH_PER_MINUTE: '10',
        RATE_LIMIT_PLAYER_PER_MINUTE: '5',
      },
    });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('X-Server-Time na każdej odpowiedzi, także 404 i 401; serverTime w state i join, nie w tablicach', async () => {
    const health = await http().get('/api/v1/health').expect(200);
    expect(health.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');
    expect(health.body.serverTime).toBe('2026-09-08T12:00:00.000Z');

    const notFound = await http().get('/api/v1/nie-ma').expect(404);
    expect(notFound.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');
    const unauthorized = await http().get('/api/v1/worlds').expect(401);
    expect(unauthorized.headers['x-server-time']).toBe(
      '2026-09-08T12:00:00.000Z',
    );

    const p = await registerPlayer(app);
    const world = await createWorld(app);
    const joined = await joinWorld(app, p.accessToken, world.id);
    expect(joined.serverTime).toBe('2026-09-08T12:00:00.000Z');
    const list = await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .set('Authorization', bearer(p.accessToken))
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');
  });

  it('login ograniczony do 10 na minutę na IP -> 429, po minucie znów działa', async () => {
    const p = await registerPlayer(app);
    for (let i = 0; i < 10; i++) {
      await http()
        .post('/api/v1/auth/login')
        .send({ email: p.email, password: 'zle' })
        .expect(401);
    }
    const limited = await http()
      .post('/api/v1/auth/login')
      .send({ email: p.email, password: p.password })
      .expect(429);
    expect(limited.body.message).toMatch(/Za dużo żądań/);
    clock.advance(60_001);
    try {
      await http()
        .post('/api/v1/auth/login')
        .send({ email: p.email, password: p.password })
        .expect(200);
    } finally {
      // Bez `finally` porażka powyżej zostawiłaby przesunięty zegar i zamieniła jedną
      // porażkę w kaskadę mylących porażek w kolejnych testach tego pliku.
      clock.advance(-60_001);
    }
  });

  it('koperta błędów Nest dla 400 i 409', async () => {
    const res = await http().post('/api/v1/auth/register').send({}).expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  // Pilnuje kolejności importów w AppModule: RateLimitGuard musi startować PO JwtAuthGuard,
  // inaczej nie zobaczy `req.playerId` i potraktuje trasę uwierzytelnioną jak anonimową (bez limitu).
  it('trasa uwierzytelniona limitowana po graczu, nie po IP', async () => {
    const a = await registerPlayer(app);
    const b = await registerPlayer(app);
    for (let i = 0; i < 5; i++) {
      await http()
        .get('/api/v1/worlds')
        .set('Authorization', bearer(a.accessToken))
        .expect(200);
    }
    const limited = await http()
      .get('/api/v1/worlds')
      .set('Authorization', bearer(a.accessToken))
      .expect(429);
    expect(limited.body.message).toMatch(/Za dużo żądań/);
    // to samo IP, inny gracz — kubełek jest po graczu, więc wolno
    await http()
      .get('/api/v1/worlds')
      .set('Authorization', bearer(b.accessToken))
      .expect(200);
  });
});
