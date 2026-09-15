import { fleets } from '../src/infra/db/schema/index.js';
import { joinWorld } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('fleets (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('widzi własne floty w pełni i cudze ATTACK na swoje osady bez ships/cargo; cudzy TRANSPORT jest niewidoczny', async () => {
    const me = await signPlayerToken();
    const enemy = await signPlayerToken();
    const mine = await joinWorld(t, me);
    const theirs = await joinWorld(t, enemy);
    const departAt = new Date('2026-09-14T12:00:00.000Z');
    const arriveAt = new Date('2026-09-14T12:40:00.000Z');
    const empty = { units: {}, resources: {} };
    await t.db.insert(fleets).values([
      { ownerId: me.id, mission: 'EXPEDITION', fromX: mine.x, fromY: mine.y, toX: mine.x + 3, toY: mine.y + 3, ships: { SLOOP: 4 }, cargo: empty, departAt, arriveAt },
      { ownerId: enemy.id, mission: 'ATTACK', fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y, ships: { GALLEON: 2 }, cargo: { units: { MILITIA: 20 }, resources: {} }, departAt, arriveAt },
      { ownerId: enemy.id, mission: 'TRANSPORT', fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y, ships: { SLOOP: 1 }, cargo: { units: {}, resources: { wood: 10 } }, departAt, arriveAt },
      { ownerId: enemy.id, mission: 'ATTACK', fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y, ships: { GALLEON: 1 }, cargo: empty, departAt, arriveAt, resolvedAt: arriveAt },
    ]);

    const res = await t.http().get('/v1/fleets').set('Authorization', bearer(me.token)).expect(200);
    expect(res.body).toHaveLength(2);
    const own = res.body.find((f: { mission: string }) => f.mission === 'EXPEDITION');
    const incoming = res.body.find((f: { mission: string }) => f.mission === 'ATTACK');
    expect(own).toMatchObject({ ownerId: me.id, ownerName: me.nickname, ships: { SLOOP: 4 }, world: t.slug });
    expect(incoming).toEqual({
      id: expect.any(String),
      world: t.slug,
      ownerId: enemy.id,
      ownerName: enemy.nickname,
      mission: 'ATTACK',
      from: { x: theirs.x, y: theirs.y },
      to: { x: mine.x, y: mine.y },
      departAt: '2026-09-14T12:00:00.000Z',
      arriveAt: '2026-09-14T12:40:00.000Z',
    });

    const enemyView = await t.http().get('/v1/fleets').set('Authorization', bearer(enemy.token)).expect(200);
    expect(enemyView.body).toHaveLength(2);
    expect(enemyView.body.every((f: { ships?: unknown }) => f.ships !== undefined)).toBe(true);
  });
});
