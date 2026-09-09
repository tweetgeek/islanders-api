import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { islandAt } from '../src/domain/geography/index.js';
import { ProfilesRepository } from '../src/modules/worlds/profiles.repository.js';
import { DB, type Db } from '../src/infra/db/db.module.js';
import {
  bearer,
  createWorld,
  joinWorld,
  registerPlayer,
} from './support/fixtures.js';
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
    await app.get(ProfilesRepository).create(app.get<Db>(DB), {
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

    await app.get(ProfilesRepository).create(app.get<Db>(DB), {
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
    await app.get(ProfilesRepository).create(app.get<Db>(DB), {
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

  it('join zakłada osadę domową na wyspie z jedzeniem, z budynkami startowymi i pakietem startowym', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app);
    const body = await joinWorld(app, p.accessToken, world.id, 'Koralowa');

    const island = islandAt(1337, body.x, body.y);
    expect(island).not.toBeNull();
    expect(['TROPICAL', 'TEMPERATE']).toContain(island!.biome);
    expect(body).toMatchObject({
      world: String(world.id),
      ownerId: p.playerId,
      ownerName: p.nickname,
      name: 'Koralowa',
      resources: { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 },
      capacity: 2000,
      population: 0,
      populationMax: 100,
      lastSyncAt: '2026-09-08T12:00:00.000Z',
    });
    expect(body.buildings).toMatchObject({
      TOWN_HALL: 1,
      WAREHOUSE: 1,
      BARRACKS: 0,
      SHIPYARD: 0,
    });
    expect(Object.keys(body.buildings as object)).toHaveLength(6);
    const production = body.productionPerHour as Record<string, number>;
    for (const r of island!.biome === 'TROPICAL'
      ? ['wood', 'food']
      : ['stone', 'food']) {
      expect(production[r]).toBeGreaterThan(0);
    }

    const state = await http()
      .get(`/api/v1/worlds/${world.id}/state`)
      .set('Authorization', bearer(p.accessToken))
      .expect(200);
    expect(state.body.homeSettlement).toEqual({ x: body.x, y: body.y });
  });

  it('powtórny join -> 409; join do świata CLOSED -> 409; join do nieistniejącego -> 404; zła nazwa -> 400', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app);
    await joinWorld(app, p.accessToken, world.id);
    await http()
      .post(`/api/v1/worlds/${world.id}/join`)
      .set('Authorization', bearer(p.accessToken))
      .send({})
      .expect(409);

    const closed = await createWorld(app, { status: 'CLOSED' });
    await http()
      .post(`/api/v1/worlds/${closed.id}/join`)
      .set('Authorization', bearer(p.accessToken))
      .send({})
      .expect(409);
    await http()
      .post('/api/v1/worlds/999999/join')
      .set('Authorization', bearer(p.accessToken))
      .send({})
      .expect(404);

    const q = await registerPlayer(app);
    await http()
      .post(`/api/v1/worlds/${world.id}/join`)
      .set('Authorization', bearer(q.accessToken))
      .send({ name: 'x'.repeat(33) })
      .expect(400);
  });

  it('dwóch graczy dostaje różne wyspy, obie blisko środka', async () => {
    const world = await createWorld(app);
    const a = await joinWorld(
      app,
      (await registerPlayer(app)).accessToken,
      world.id,
    );
    const b = await joinWorld(
      app,
      (await registerPlayer(app)).accessToken,
      world.id,
    );
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
    for (const s of [a, b]) {
      expect(Math.abs(s.x - 100)).toBeLessThan(70);
      expect(Math.abs(s.y - 100)).toBeLessThan(70);
    }
  });
});
