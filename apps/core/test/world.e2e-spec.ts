import { AUDIENCE } from '@islanders/contracts';
import { FixedClock } from '@islanders/domain/time';
import { islandAt } from '../src/domain/geography/index.js';
import { insertProfile, joinWorld, setWorldStatus } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken, signToolsToken } from './support/tokens.js';

describe('świat gracza (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-14T12:00:00.000Z'));

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  const getWorld = (token?: string) => {
    const req = t.http().get('/v1/world');
    return token === undefined ? req : req.set('Authorization', bearer(token));
  };

  it('bez tokenu, ze złym tokenem, bez sub, z obcym aud i issuer, po wygaśnięciu -> 401', async () => {
    await getWorld().expect(401);
    await getWorld('nie.jwt.token').expect(401);
    await getWorld((await signPlayerToken({ omitSub: true })).token).expect(401);
    await getWorld(await signToolsToken()).expect(401);
    await getWorld((await signPlayerToken({ audience: AUDIENCE.internal })).token).expect(401);
    await getWorld((await signPlayerToken({ issuer: 'https://evil.test' })).token).expect(401);
    await getWorld((await signPlayerToken({ expiresInSeconds: -60 })).token).expect(401);
  });

  it('schemat Bearer pisany małą literą -> 200 (RFC 7235)', async () => {
    const p = await signPlayerToken();
    await t.http().get('/v1/world').set('Authorization', `bearer ${p.token}`).expect(200);
  });

  it('GET /v1/world bez profilu: dane publiczne i profile = null', async () => {
    const p = await signPlayerToken();
    const res = await getWorld(p.token).expect(200);
    expect(res.body).toEqual({
      slug: t.slug,
      name: 'Świat testowy',
      status: 'OPEN',
      isTest: false,
      seed: 1337,
      size: { w: 200, h: 200 },
      wind: { x: 0.3, y: -0.1 },
      profile: null,
      serverTime: '2026-09-14T12:00:00.000Z',
    });
  });

  it('profil bez osady: homeSettlement = null', async () => {
    const p = await signPlayerToken();
    await insertProfile(t, p);
    const res = await getWorld(p.token).expect(200);
    expect(res.body.profile).toEqual({ playerId: p.id, homeSettlement: null });
  });

  it('join zakłada osadę domową na wyspie z jedzeniem, z budynkami i pakietem startowym', async () => {
    const p = await signPlayerToken();
    const body = await joinWorld(t, p, 'Koralowa');
    const island = islandAt(1337, body.x, body.y);
    expect(island).not.toBeNull();
    expect(['TROPICAL', 'TEMPERATE']).toContain(island!.biome);
    expect(body).toMatchObject({
      world: t.slug,
      ownerId: p.id,
      ownerName: p.nickname,
      name: 'Koralowa',
      resources: { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 },
      capacity: 2000,
      population: 0,
      populationMax: 100,
      lastSyncAt: '2026-09-14T12:00:00.000Z',
    });
    expect(body.buildings).toMatchObject({ TOWN_HALL: 1, WAREHOUSE: 1, BARRACKS: 0, SHIPYARD: 0 });
    expect(Object.keys(body.buildings as object)).toHaveLength(6);
    const state = await getWorld(p.token).expect(200);
    expect(state.body.profile).toEqual({ playerId: p.id, homeSettlement: { x: body.x, y: body.y } });
  });

  it('powtórny join -> 409; zła nazwa -> 400; świat CLOSED -> 409', async () => {
    const p = await signPlayerToken();
    await joinWorld(t, p);
    await t.http().post('/v1/join').set('Authorization', bearer(p.token)).send({}).expect(409);
    const q = await signPlayerToken();
    await t.http().post('/v1/join').set('Authorization', bearer(q.token)).send({ name: 'x'.repeat(33) }).expect(400);
    await setWorldStatus(t, 'CLOSED');
    try {
      await t.http().post('/v1/join').set('Authorization', bearer(q.token)).send({}).expect(409);
      await getWorld(q.token).expect(200);
    } finally {
      await setWorldStatus(t, 'OPEN');
    }
  });

  it('świat ENDED jest do odczytu', async () => {
    const p = await signPlayerToken();
    await setWorldStatus(t, 'ENDED');
    try {
      const res = await getWorld(p.token).expect(200);
      expect(res.body.status).toBe('ENDED');
    } finally {
      await setWorldStatus(t, 'OPEN');
    }
  });

  it('dwóch graczy dostaje różne wyspy, obie blisko środka', async () => {
    const a = await joinWorld(t, await signPlayerToken());
    const b = await joinWorld(t, await signPlayerToken());
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
    for (const s of [a, b]) {
      expect(Math.abs(s.x - 100)).toBeLessThan(70);
      expect(Math.abs(s.y - 100)).toBeLessThan(70);
    }
  });
});

describe('świat testowy i DRAFT (e2e)', () => {
  it('świat testowy: gracz bez roli tester -> 403, tester i admin -> 200', async () => {
    const t = await createTestApp({ world: { isTest: true } });
    try {
      await t.http().get('/v1/world').set('Authorization', bearer((await signPlayerToken()).token)).expect(403);
      const tester = await signPlayerToken({ roles: ['player', 'tester'] });
      await t.http().get('/v1/world').set('Authorization', bearer(tester.token)).expect(200);
      const admin = await signPlayerToken({ roles: ['player', 'admin'] });
      await t.http().get('/v1/world').set('Authorization', bearer(admin.token)).expect(200);
    } finally {
      await t.close();
    }
  });

  it('DRAFT: gracz bez roli -> 404 na świecie i dołączeniu; tester widzi świat, ale nie dołączy', async () => {
    const t = await createTestApp({ world: { status: 'DRAFT' } });
    try {
      const p = await signPlayerToken();
      const missing = await t.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(404);
      expect(missing.body.message).toBe('Świat nie istnieje');
      await t.http().post('/v1/join').set('Authorization', bearer(p.token)).send({}).expect(404);
      const tester = await signPlayerToken({ roles: ['player', 'tester'] });
      const res = await t.http().get('/v1/world').set('Authorization', bearer(tester.token)).expect(200);
      expect(res.body.status).toBe('DRAFT');
      await t.http().post('/v1/join').set('Authorization', bearer(tester.token)).send({}).expect(409);
    } finally {
      await t.close();
    }
  });
});
