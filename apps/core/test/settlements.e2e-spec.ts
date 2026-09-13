import { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { startingBuildings } from '@islanders/domain/balance';
import { islandAt } from '../src/domain/geography/index.js';
import { FixedClock } from '@islanders/domain/time';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { buildings } from '../src/infra/db/schema/index.js';
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
  });

  it('w jednym prostokącie budynki trafiają do właściwej osady, a nie do sąsiada', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const other = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id, 'Moja');
    const theirs = await joinWorld(app, other.accessToken, world.id, 'Cudza');

    // Obie osady startują identycznie, więc pomylone przypisanie poziomów byłoby
    // niewidoczne. Różnicujemy je w bazie: u mnie BARRACKS 5, u sąsiada TOWN_HALL 7.
    const db = app.get<Db>(DB);
    const levelAt = (
      c: { x: number; y: number },
      type: 'BARRACKS' | 'TOWN_HALL',
      level: number,
    ) =>
      db
        .update(buildings)
        .set({ level })
        .where(
          and(
            eq(buildings.worldId, world.id),
            eq(buildings.x, c.x),
            eq(buildings.y, c.y),
            eq(buildings.type, type),
          ),
        );
    await levelAt(mine, 'BARRACKS', 5);
    await levelAt(theirs, 'TOWN_HALL', 7);

    const bbox = `${Math.max(0, Math.min(mine.x, theirs.x) - 3)},${Math.max(0, Math.min(mine.y, theirs.y) - 3)},${Math.min(199, Math.max(mine.x, theirs.x) + 3)},${Math.min(199, Math.max(mine.y, theirs.y) + 3)}`;
    const res = await http()
      .get(`/api/v1/worlds/${world.id}/settlements`)
      .query({ bbox })
      .set('Authorization', bearer(me.accessToken))
      .expect(200);
    const own = res.body.find(
      (s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y,
    );
    const foreign = res.body.find(
      (s: { x: number; y: number }) => s.x === theirs.x && s.y === theirs.y,
    );
    // Obie osady różnych właścicieli naprawdę są w tym prostokącie.
    expect(foreign).toBeDefined();
    expect(foreign.ownerId).toBe(other.playerId);
    expect(own.ownerId).toBe(me.playerId);
    // Mój podniesiony poziom jest odczytany, a poziom sąsiada się nie przelał:
    // TOWN_HALL musi zostać na 1, mimo że u sąsiada w tym samym prostokącie jest 7.
    expect(own.buildings).toEqual({
      ...startingBuildings(islandAt(1337, mine.x, mine.y)!.biome),
      BARRACKS: 5,
    });
    expect(own.buildings.TOWN_HALL).toBe(1);
    expect(own.populationMax).toBe(100);
  });

  it('zasoby rosną leniwie bez zapisu: po godzinie odczyt pokazuje produkcję, lastSyncAt = now', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    await joinWorld(app, me.accessToken, world.id);
    // Cofnięcie zegara w finally: gdyby asercja padła, przesunięcie wyciekłoby
    // do kolejnych testów w tym pliku (rozbudują go zadania 15 i 16).
    clock.advance(3600_000);
    try {
      const res = await http()
        .get(`/api/v1/worlds/${world.id}/settlements`)
        .set('Authorization', bearer(me.accessToken))
        .expect(200);
      const s = res.body[0];
      expect(s.resources.food).toBe(1000 + s.productionPerHour.food);
      expect(s.lastSyncAt).toBe(clock.now().toISOString());
    } finally {
      clock.advance(-3600_000);
    }
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
