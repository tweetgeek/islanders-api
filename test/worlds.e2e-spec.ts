import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { ProfilesRepository } from '../src/modules/worlds/profiles.repository.js';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { bearer, createWorld, registerPlayer } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('worlds (e2e)', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /worlds bez tokenu -> 401, ze złym tokenem -> 401', async () => {
    await http().get('/api/v1/worlds').expect(401);
    await http()
      .get('/api/v1/worlds')
      .set('Authorization', 'Bearer nie.jwt.token')
      .expect(401);
  });

  it('GET /worlds z poprawnym tokenem -> 200', async () => {
    const p = await registerPlayer(app);
    await http()
      .get('/api/v1/worlds')
      .set('Authorization', bearer(p.accessToken))
      .expect(200);
  });

  it('GET /worlds ze schematem pisanym małą literą -> 200 (RFC 7235)', async () => {
    const p = await registerPlayer(app);
    await http()
      .get('/api/v1/worlds')
      .set('Authorization', `bearer ${p.accessToken}`)
      .expect(200);
  });

  it('GET /worlds z tokenem bez pola sub -> 401', async () => {
    const token = await app.get(JwtService).signAsync({});
    await http()
      .get('/api/v1/worlds')
      .set('Authorization', bearer(token))
      .expect(401);
  });

  it('GET /worlds listuje światy z flagą joined', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app, { seed: 4242 });
    await app
      .get(ProfilesRepository)
      .create(app.get<Db>(DB), {
        worldId: world.id,
        playerId: p.playerId,
        homeX: null,
        homeY: null,
      });
    const other = await createWorld(app, { seed: 4343 });

    const res = await http()
      .get('/api/v1/worlds')
      .set('Authorization', bearer(p.accessToken))
      .expect(200);
    const mine = res.body.find(
      (w: { id: string }) => w.id === String(world.id),
    );
    const notMine = res.body.find(
      (w: { id: string }) => w.id === String(other.id),
    );
    expect(mine).toEqual({
      id: String(world.id),
      seed: 4242,
      size: { w: 200, h: 200 },
      wind: { x: 0.3, y: -0.1 },
      status: 'OPEN',
      joined: true,
    });
    expect(notMine.joined).toBe(false);
  });

  it('GET /worlds/:id/state: 404 dla nieistniejącego, 403 bez profilu, 200 z profilem', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app);
    await http()
      .get('/api/v1/worlds/999999/state')
      .set('Authorization', bearer(p.accessToken))
      .expect(404);
    await http()
      .get('/api/v1/worlds/abc/state')
      .set('Authorization', bearer(p.accessToken))
      .expect(404);
    await http()
      .get(`/api/v1/worlds/${world.id}/state`)
      .set('Authorization', bearer(p.accessToken))
      .expect(403);

    await app
      .get(ProfilesRepository)
      .create(app.get<Db>(DB), {
        worldId: world.id,
        playerId: p.playerId,
        homeX: null,
        homeY: null,
      });
    const res = await http()
      .get(`/api/v1/worlds/${world.id}/state`)
      .set('Authorization', bearer(p.accessToken))
      .expect(200);
    // toMatchObject, nie toEqual: Task 16 dołoży do odpowiedzi-obiektów pole `serverTime`, które sprawdza http.e2e-spec.ts
    expect(res.body).toMatchObject({
      id: String(world.id),
      seed: 1337,
      size: { w: 200, h: 200 },
      wind: { x: 0.3, y: -0.1 },
      status: 'OPEN',
      playerId: p.playerId,
      homeSettlement: null,
    });
  });

  it('state działa także na świecie ENDED (odczyt zawsze dozwolony)', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app, { status: 'ENDED' });
    await app
      .get(ProfilesRepository)
      .create(app.get<Db>(DB), {
        worldId: world.id,
        playerId: p.playerId,
        homeX: null,
        homeY: null,
      });
    const res = await http()
      .get(`/api/v1/worlds/${world.id}/state`)
      .set('Authorization', bearer(p.accessToken))
      .expect(200);
    expect(res.body.status).toBe('ENDED');
  });
});
