import { createLocalJWKSet, jwtVerify } from 'jose';
import { FixedClock } from '@islanders/domain/time';
import { registerPlayer, uniqueSuffix } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const ISSUER = 'https://users.islanders.test';

describe('auth: konta i tokeny (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  it('register: 201 z uuid konta, rolą player i parą tokenów', async () => {
    const a = await registerPlayer(t);
    expect(a.playerId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.roles).toEqual(['player']);
    expect(a.accessToken.split('.')).toHaveLength(3);
    expect(a.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('access token weryfikuje się przez JWKS z iss, aud i claimami gracza — tak jak zrobi to core', async () => {
    const a = await registerPlayer(t);
    const jwksRes = await t.publicHttp().get('/.well-known/jwks.json').expect(200);
    expect(jwksRes.headers['cache-control']).toBe('public, max-age=300');
    const { payload, protectedHeader } = await jwtVerify(
      a.accessToken,
      createLocalJWKSet(jwksRes.body),
      { issuer: ISSUER, audience: 'islanders-worlds', currentDate: clock.now() },
    );
    expect(protectedHeader.alg).toBe('EdDSA');
    expect(payload).toMatchObject({ sub: a.playerId, roles: ['player'], nickname: a.nickname });
    expect(payload.exp! - payload.iat!).toBe(900);
    await t.internalHttp().get('/.well-known/jwks.json').expect(200);
  });

  it('waliduje ciało rejestracji', async () => {
    const send = (body: object) => t.publicHttp().post('/v1/auth/register').send(body);
    await send({ email: 'nie-email', nickname: 'ok_nick', password: 'haslo-testowe-123' }).expect(400);
    await send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'ok_nick', password: 'krotkie' }).expect(400);
    await send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'zł y', password: 'haslo-testowe-123' }).expect(400);
    await send({
      email: `a-${uniqueSuffix()}@t.pl`,
      nickname: `n_${uniqueSuffix()}`,
      password: 'haslo-testowe-123',
      roles: ['admin'],
    }).expect(400);
  });

  it('zajęty e-mail i pseudonim (inną wielkością liter) -> 409 z field', async () => {
    const a = await registerPlayer(t);
    const email = await t
      .publicHttp()
      .post('/v1/auth/register')
      .send({ email: a.email.toUpperCase(), nickname: `x_${uniqueSuffix()}`, password: 'haslo-testowe-123' })
      .expect(409);
    expect(email.body).toMatchObject({ statusCode: 409, error: 'Conflict', message: 'E-mail jest już zajęty', field: 'email' });
    const nick = await t
      .publicHttp()
      .post('/v1/auth/register')
      .send({ email: `y-${uniqueSuffix()}@t.pl`, nickname: a.nickname.toUpperCase(), password: 'haslo-testowe-123' })
      .expect(409);
    expect(nick.body).toMatchObject({ message: 'Pseudonim jest już zajęty', field: 'nickname' });
  });

  it('login: 200; złe hasło i nieistniejące konto -> 401 o tej samej treści', async () => {
    const a = await registerPlayer(t);
    const ok = await t.publicHttp().post('/v1/auth/login').send({ email: a.email, password: a.password }).expect(200);
    expect(ok.body.playerId).toBe(a.playerId);
    const bad = await t.publicHttp().post('/v1/auth/login').send({ email: a.email, password: 'zle-haslo-123' }).expect(401);
    const missing = await t
      .publicHttp()
      .post('/v1/auth/login')
      .send({ email: `nikt-${uniqueSuffix()}@t.pl`, password: 'x' })
      .expect(401);
    expect(bad.body.message).toBe(missing.body.message);
  });

  it('refresh rotuje; stary token działa w oknie łaski 60 s, po nim 401', async () => {
    const a = await registerPlayer(t);
    const refresh = (token: string) => t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: token });
    const first = await refresh(a.refreshToken).expect(200);
    expect(first.body.refreshToken).not.toBe(a.refreshToken);
    clock.advance(30_000);
    const inGrace = await refresh(a.refreshToken).expect(200);
    clock.advance(31_000);
    try {
      await refresh(a.refreshToken).expect(401);
      await refresh(first.body.refreshToken).expect(200);
      await refresh(inGrace.body.refreshToken).expect(200);
    } finally {
      clock.advance(-61_000);
    }
  });

  it('dwa równoległe odświeżenia tym samym tokenem kończą się 200 i jedną rotacją', async () => {
    const a = await registerPlayer(t);
    const [one, two] = await Promise.all([
      t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }),
      t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }),
    ]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(one.body.refreshToken).not.toBe(two.body.refreshToken);
  });

  it('logout unieważnia natychmiast, także stary token w oknie łaski', async () => {
    const a = await registerPlayer(t);
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
    clock.advance(10_000);
    try {
      await t.publicHttp().post('/v1/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
      await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
      await t.publicHttp().post('/v1/auth/logout').send({ refreshToken: 'nie-istnieje' }).expect(204);
    } finally {
      clock.advance(-10_000);
    }
  });

  it('odpowiedzi mają dokładnie ustalone pola', async () => {
    const suffix = uniqueSuffix();
    const body = { email: `k-${suffix}@t.pl`, nickname: `k_${suffix}`, password: 'haslo-testowe-123' };
    const registered = await t.publicHttp().post('/v1/auth/register').send(body).expect(201);
    expect(Object.keys(registered.body).sort()).toEqual(
      ['accessToken', 'nickname', 'playerId', 'refreshToken', 'roles', 'serverTime'],
    );
    const refreshed = await t
      .publicHttp()
      .post('/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(200);
    expect(Object.keys(refreshed.body).sort()).toEqual(['accessToken', 'refreshToken', 'serverTime']);
  });

  it('trasy kont nie istnieją na porcie wewnętrznym', async () => {
    await t.internalHttp().post('/v1/auth/login').send({ email: 'a@b.pl', password: 'x' }).expect(404);
  });
});
