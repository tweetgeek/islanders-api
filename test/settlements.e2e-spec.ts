import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startingBuildings } from '../src/domain/balance/index.js';
import { islandAt } from '../src/domain/geography/index.js';
import { FixedClock } from '../src/domain/time/index.js';
import {
  bearer,
  createWorld,
  joinWorld,
  registerPlayer,
} from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('settlements (e2e) — reguły informacyjne', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('bez bbox: tylko własne osady, w pełni', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const other = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id, 'Moja');
    await joinWorld(app, other.accessToken, world.id, 'Cudza');

    const res = await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .set('Authorization', bearer(me.accessToken))
      .expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      x: mine.x,
      y: mine.y,
      name: 'Moja',
      ownerName: me.nickname,
    });
    expect(res.body[0].resources).toBeDefined();
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('z bbox: własna z resources, cudza bez klucza resources, obie z ownerName', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const other = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id, 'Moja');
    const theirs = await joinWorld(app, other.accessToken, world.id, 'Cudza');

    const around = (c: { x: number; y: number }) =>
      `${Math.max(0, c.x - 3)},${Math.max(0, c.y - 3)},${Math.min(199, c.x + 3)},${Math.min(199, c.y + 3)}`;
    const resMine = await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .query({ bbox: around(mine) })
      .set('Authorization', bearer(me.accessToken))
      .expect(200);
    const resTheirs = await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .query({ bbox: around(theirs) })
      .set('Authorization', bearer(me.accessToken))
      .expect(200);
    const own = resMine.body.find(
      (s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y,
    );
    const foreign = resTheirs.body.find(
      (s: { x: number; y: number }) => s.x === theirs.x && s.y === theirs.y,
    );
    expect(own.resources).toEqual({
      wood: 500,
      stone: 200,
      food: 1000,
      iron: 40,
      sulfur: 0,
    });
    expect(own.ownerName).toBe(me.nickname);
    expect(foreign).toEqual({
      world: String(world.id),
      x: theirs.x,
      y: theirs.y,
      ownerId: other.playerId,
      ownerName: other.nickname,
      name: 'Cudza',
    });
    expect('resources' in foreign).toBe(false);

    // Prostokąt musi naprawdę obejmować obie osady różnych właścicieli: dopiero wtedy
    // złączenie budynków z osadami się wykonuje i widać, czy nie wciąga cudzych poziomów.
    const foreignInMineBox = resMine.body.find(
      (s: { x: number; y: number }) => s.x === theirs.x && s.y === theirs.y,
    );
    expect(foreignInMineBox).toBeDefined();
    expect(foreignInMineBox.ownerId).toBe(other.playerId);
    expect(foreignInMineBox.ownerId).not.toBe(own.ownerId);
    expect('buildings' in foreignInMineBox).toBe(false);
    expect(own.buildings).toEqual(
      startingBuildings(islandAt(1337, mine.x, mine.y)!.biome),
    );
  });

  it('zasoby rosną leniwie bez zapisu: po godzinie odczyt pokazuje produkcję, lastSyncAt = now', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    await joinWorld(app, me.accessToken, world.id);
    clock.advance(3600_000);
    const res = await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .set('Authorization', bearer(me.accessToken))
      .expect(200);
    const s = res.body[0];
    expect(s.resources.food).toBe(1000 + s.productionPerHour.food);
    expect(s.lastSyncAt).toBe(clock.now().toISOString());
    clock.advance(-3600_000);
  });

  it('bbox > 4096 komórek albo poza mapą -> 400; bez profilu -> 403', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    await joinWorld(app, me.accessToken, world.id);
    await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .query({ bbox: '0,0,64,63' })
      .set('Authorization', bearer(me.accessToken))
      .expect(400);
    await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .query({ bbox: '0,0,10,200' })
      .set('Authorization', bearer(me.accessToken))
      .expect(400);
    const stranger = await registerPlayer(app);
    await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .set('Authorization', bearer(stranger.accessToken))
      .expect(403);
  });
});
