import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { fleets } from '../src/infra/db/schema/index.js';
import {
  bearer,
  createWorld,
  joinWorld,
  registerPlayer,
} from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('fleets (e2e)', () => {
  let app: INestApplication;
  let db: Db;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<Db>(DB);
  });
  afterAll(async () => {
    await app.close();
  });

  it('widzi własne floty w pełni i cudze ATTACK na swoje osady bez ships/cargo; cudzy TRANSPORT jest niewidoczny', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const enemy = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id);
    const theirs = await joinWorld(app, enemy.accessToken, world.id);
    const departAt = new Date('2026-09-08T12:00:00.000Z');
    const arriveAt = new Date('2026-09-08T12:40:00.000Z');

    await db.insert(fleets).values([
      {
        worldId: world.id,
        ownerId: me.playerId,
        mission: 'EXPEDITION',
        fromX: mine.x,
        fromY: mine.y,
        toX: mine.x + 3,
        toY: mine.y + 3,
        ships: { SLOOP: 4 },
        cargo: { units: {}, resources: {} },
        departAt,
        arriveAt,
      },
      {
        worldId: world.id,
        ownerId: enemy.playerId,
        mission: 'ATTACK',
        fromX: theirs.x,
        fromY: theirs.y,
        toX: mine.x,
        toY: mine.y,
        ships: { GALLEON: 2 },
        cargo: { units: { MILITIA: 20 }, resources: {} },
        departAt,
        arriveAt,
      },
      {
        worldId: world.id,
        ownerId: enemy.playerId,
        mission: 'TRANSPORT',
        fromX: theirs.x,
        fromY: theirs.y,
        toX: mine.x,
        toY: mine.y,
        ships: { SLOOP: 1 },
        cargo: { units: {}, resources: { wood: 10 } },
        departAt,
        arriveAt,
      },
      {
        worldId: world.id,
        ownerId: enemy.playerId,
        mission: 'ATTACK',
        fromX: theirs.x,
        fromY: theirs.y,
        toX: mine.x,
        toY: mine.y,
        ships: { GALLEON: 1 },
        cargo: { units: {}, resources: {} },
        departAt,
        arriveAt,
        resolvedAt: arriveAt,
      },
    ]);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/worlds/${world.id}/fleets`)
      .set('Authorization', bearer(me.accessToken))
      .expect(200);
    expect(res.body).toHaveLength(2);
    const own = res.body.find(
      (f: { mission: string }) => f.mission === 'EXPEDITION',
    );
    const incoming = res.body.find(
      (f: { mission: string }) => f.mission === 'ATTACK',
    );
    expect(own).toMatchObject({
      ownerId: me.playerId,
      ownerName: me.nickname,
      ships: { SLOOP: 4 },
      world: String(world.id),
    });
    expect(incoming).toEqual({
      id: expect.any(String),
      world: String(world.id),
      ownerId: enemy.playerId,
      ownerName: enemy.nickname,
      mission: 'ATTACK',
      from: { x: theirs.x, y: theirs.y },
      to: { x: mine.x, y: mine.y },
      departAt: '2026-09-08T12:00:00.000Z',
      arriveAt: '2026-09-08T12:40:00.000Z',
    });

    const enemyView = await request(app.getHttpServer())
      .get(`/api/v1/worlds/${world.id}/fleets`)
      .set('Authorization', bearer(enemy.accessToken))
      .expect(200);
    expect(enemyView.body).toHaveLength(2);
    expect(
      enemyView.body.every((f: { ships?: unknown }) => f.ships !== undefined),
    ).toBe(true);
  });
});
