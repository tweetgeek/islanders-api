import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { registerPlayer, uniqueSuffix } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('auth (e2e)', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('register zwraca 201 z playerId, nickname i parą tokenów', async () => {
    const p = await registerPlayer(app);
    expect(p.playerId).toEqual(expect.any(Number));
    expect(p.nickname).toMatch(/^p_/);
    expect(p.accessToken.split('.')).toHaveLength(3);
    expect(p.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('waliduje ciało: zły e-mail, krótkie hasło, zły pseudonim, nieznane pole', async () => {
    await http()
      .post('/api/v1/auth/register')
      .send({
        email: 'nie-email',
        nickname: 'ok_nick',
        password: 'haslo-testowe-123',
      })
      .expect(400);
    await http()
      .post('/api/v1/auth/register')
      .send({
        email: `a-${uniqueSuffix()}@t.pl`,
        nickname: 'ok_nick',
        password: 'krotkie',
      })
      .expect(400);
    await http()
      .post('/api/v1/auth/register')
      .send({
        email: `a-${uniqueSuffix()}@t.pl`,
        nickname: 'zł y',
        password: 'haslo-testowe-123',
      })
      .expect(400);
    await http()
      .post('/api/v1/auth/register')
      .send({
        email: `a-${uniqueSuffix()}@t.pl`,
        nickname: 'ok_nick2',
        password: 'haslo-testowe-123',
        admin: true,
      })
      .expect(400);
  });

  it('zajęty e-mail (inną wielkością liter) -> 409 z field=email', async () => {
    const p = await registerPlayer(app);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email: p.email.toUpperCase(),
        nickname: `x_${uniqueSuffix()}`,
        password: 'haslo-testowe-123',
      })
      .expect(409);
    expect(res.body.field).toBe('email');
  });

  it('zajęty pseudonim (inną wielkością liter) -> 409 z field=nickname', async () => {
    const p = await registerPlayer(app);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email: `y-${uniqueSuffix()}@t.pl`,
        nickname: p.nickname.toUpperCase(),
        password: 'haslo-testowe-123',
      })
      .expect(409);
    expect(res.body.field).toBe('nickname');
  });

  it('login: poprawne dane -> 200, złe hasło i nieistniejące konto -> 401 o tej samej treści', async () => {
    const p = await registerPlayer(app);
    const ok = await http()
      .post('/api/v1/auth/login')
      .send({ email: p.email, password: p.password })
      .expect(200);
    expect(ok.body.playerId).toBe(p.playerId);
    expect(ok.body.nickname).toBe(p.nickname);
    const bad = await http()
      .post('/api/v1/auth/login')
      .send({ email: p.email, password: 'zle-haslo-123' })
      .expect(401);
    const missing = await http()
      .post('/api/v1/auth/login')
      .send({ email: `nikt-${uniqueSuffix()}@t.pl`, password: 'x' })
      .expect(401);
    expect(bad.body.message).toBe(missing.body.message);
  });

  it('refresh rotuje token; stary działa w oknie łaski 60 s, po nim 401 bez wylogowania innych', async () => {
    const p = await registerPlayer(app);
    const first = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: p.refreshToken })
      .expect(200);
    expect(first.body.refreshToken).not.toBe(p.refreshToken);
    expect(first.body.accessToken.split('.')).toHaveLength(3);

    clock.advance(30_000);
    const inGrace = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: p.refreshToken })
      .expect(200);
    expect(inGrace.body.refreshToken).not.toBe(first.body.refreshToken);

    clock.advance(31_000);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: p.refreshToken })
      .expect(401);

    // tokeny wydane wcześniej nadal działają — nie ma masowego wylogowania
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(200);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: inGrace.body.refreshToken })
      .expect(200);
  });

  it('refresh po wygaśnięciu -> 401', async () => {
    const p = await registerPlayer(app);
    // Cofnięcie zegara w finally: gdyby asercja padła, kolejne testy w pliku
    // posypałyby się z niepowiązanego powodu, bo zegar zostałby 31 dni w przód.
    clock.advance(31 * 24 * 3600_000);
    try {
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: p.refreshToken })
        .expect(401);
    } finally {
      clock.advance(-31 * 24 * 3600_000);
    }
  });

  it('logout unieważnia natychmiast, bez okna łaski; powtórny logout to nadal 204', async () => {
    const p = await registerPlayer(app);
    await http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: p.refreshToken })
      .expect(204);
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: p.refreshToken })
      .expect(401);
    await http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: p.refreshToken })
      .expect(204);
    await http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: 'nie-istnieje' })
      .expect(204);
  });

  it('logout starym tokenem w oknie łaski unieważnia go natychmiast', async () => {
    const p = await registerPlayer(app);
    // Klient odświeżył, ale odpowiedź z nową parą zginęła — nadal trzyma stary token.
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: p.refreshToken })
      .expect(200);
    clock.advance(10_000);
    await http()
      .post('/api/v1/auth/logout')
      .send({ refreshToken: p.refreshToken })
      .expect(204);
    // Wylogowanie omija okno łaski, więc stary token nie wybije już świeżej pary.
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: p.refreshToken })
      .expect(401);
  });

  it('odpowiedzi auth mają dokładnie ustalone pola — nic więcej nie wycieka', async () => {
    const suffix = uniqueSuffix();
    const body = {
      email: `k-${suffix}@t.pl`,
      nickname: `k_${suffix}`,
      password: 'haslo-testowe-123',
    };
    const registered = await http()
      .post('/api/v1/auth/register')
      .send(body)
      .expect(201);
    expect(Object.keys(registered.body).sort()).toEqual([
      'accessToken',
      'nickname',
      'playerId',
      'refreshToken',
    ]);

    const logged = await http()
      .post('/api/v1/auth/login')
      .send({ email: body.email, password: body.password })
      .expect(200);
    expect(Object.keys(logged.body).sort()).toEqual([
      'accessToken',
      'nickname',
      'playerId',
      'refreshToken',
    ]);

    const refreshed = await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(200);
    expect(Object.keys(refreshed.body).sort()).toEqual([
      'accessToken',
      'refreshToken',
    ]);
  });
});
