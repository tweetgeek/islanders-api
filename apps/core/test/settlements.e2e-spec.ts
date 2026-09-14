import { and, eq } from 'drizzle-orm';
import { startingBuildings } from '@islanders/domain/balance';
import { FixedClock } from '@islanders/domain/time';
import { islandAt } from '../src/domain/geography/index.js';
import { buildings } from '../src/infra/db/schema/index.js';
import { joinWorld } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('settlements (e2e) — reguły informacyjne', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-14T12:00:00.000Z'));

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  const around = (a: { x: number; y: number }, b: { x: number; y: number } = a) =>
    `${Math.max(0, Math.min(a.x, b.x) - 3)},${Math.max(0, Math.min(a.y, b.y) - 3)},${Math.min(199, Math.max(a.x, b.x) + 3)},${Math.min(199, Math.max(a.y, b.y) + 3)}`;
  const list = (token: string, bbox?: string) => {
    const req = t.http().get('/v1/settlements').set('Authorization', bearer(token));
    return bbox === undefined ? req : req.query({ bbox });
  };

  it('bez bbox: tylko własne osady, w pełni', async () => {
    const me = await signPlayerToken();
    const other = await signPlayerToken();
    const mine = await joinWorld(t, me, 'Moja');
    await joinWorld(t, other, 'Cudza');
    const res = await list(me.token).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ x: mine.x, y: mine.y, name: 'Moja', ownerName: me.nickname, world: t.slug });
    expect(res.body[0].resources).toBeDefined();
  });

  it('z bbox: własna z resources, cudza bez klucza resources, obie z ownerName', async () => {
    const me = await signPlayerToken();
    const other = await signPlayerToken();
    const mine = await joinWorld(t, me, 'Moja');
    const theirs = await joinWorld(t, other, 'Cudza');
    const res = await list(me.token, around(mine, theirs)).expect(200);
    const own = res.body.find((s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y);
    const foreign = res.body.find((s: { x: number; y: number }) => s.x === theirs.x && s.y === theirs.y);
    expect(own).toMatchObject({ ownerId: me.id, ownerName: me.nickname });
    expect(own.resources).toBeDefined();
    expect(foreign).toBeDefined();
    expect(foreign.ownerId).toBe(other.id);
    expect(foreign.ownerName).toBe(other.nickname);
    expect('resources' in foreign).toBe(false);
    expect('buildings' in foreign).toBe(false);
  });

  it('w jednym prostokącie budynki trafiają do właściwej osady, a nie do sąsiada', async () => {
    const me = await signPlayerToken();
    const other = await signPlayerToken();
    const mine = await joinWorld(t, me, 'Moja');
    const theirs = await joinWorld(t, other, 'Cudza');
    // Obie osady startują identycznie, więc pomylone przypisanie poziomów byłoby niewidoczne.
    const levelAt = (c: { x: number; y: number }, type: 'BARRACKS' | 'TOWN_HALL', level: number) =>
      t.db.update(buildings).set({ level })
        .where(and(eq(buildings.x, c.x), eq(buildings.y, c.y), eq(buildings.type, type)));
    await levelAt(mine, 'BARRACKS', 5);
    await levelAt(theirs, 'TOWN_HALL', 7);
    const res = await list(me.token, around(mine, theirs)).expect(200);
    const own = res.body.find((s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y);
    expect(own.buildings).toEqual({ ...startingBuildings(islandAt(1337, mine.x, mine.y)!.biome), BARRACKS: 5 });
    expect(own.buildings.TOWN_HALL).toBe(1);
  });

  it('zasoby rosną leniwie bez zapisu: po godzinie odczyt pokazuje produkcję, lastSyncAt = now', async () => {
    const me = await signPlayerToken();
    await joinWorld(t, me);
    clock.advance(3_600_000);
    try {
      const res = await list(me.token).expect(200);
      const s = res.body[0];
      expect(s.resources.food).toBe(1000 + s.productionPerHour.food);
      expect(s.lastSyncAt).toBe(clock.now().toISOString());
    } finally {
      clock.advance(-3_600_000);
    }
  });

  it('bbox > 4096 komórek albo poza mapą -> 400; bez profilu -> 403', async () => {
    const me = await signPlayerToken();
    await joinWorld(t, me);
    await list(me.token, '0,0,64,63').expect(400);
    await list(me.token, '0,0,10,200').expect(400);
    await list((await signPlayerToken()).token).expect(403);
  });
});
