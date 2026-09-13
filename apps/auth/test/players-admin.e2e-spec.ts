import { createLocalJWKSet, jwtVerify } from 'jose';
import { PlayersAdmin, PlayerNotFoundError, InvalidRoleChangeError } from '../src/players/players-admin.js';
import { registerPlayer } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: role, blokada i tools (e2e)', () => {
  let t: TestApp;
  let admin: PlayersAdmin;

  beforeAll(async () => {
    t = await createTestApp();
    admin = t.app.get(PlayersAdmin);
  });
  afterAll(async () => {
    await t.close();
  });

  const login = (email: string, password: string) =>
    t.publicHttp().post('/v1/auth/login').send({ email, password });

  it('nadanie i odebranie roli zmienia claimy przy następnym odświeżeniu', async () => {
    const a = await registerPlayer(t);
    expect(await admin.changeRoles(a.email, ['tester'], [])).toEqual(['player', 'tester']);
    const refreshed = await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
    const jwks = (await t.publicHttp().get('/.well-known/jwks.json')).body;
    const { payload } = await jwtVerify(refreshed.body.accessToken, createLocalJWKSet(jwks), {
      audience: 'islanders-worlds',
    });
    expect(payload.roles).toEqual(['player', 'tester']);
    expect(await admin.changeRoles(a.email, [], ['tester'])).toEqual(['player']);
  });

  it('rola player jest nieusuwalna, nieznana rola i nieznane konto są odrzucane', async () => {
    const a = await registerPlayer(t);
    await expect(admin.changeRoles(a.email, [], ['player'])).rejects.toBeInstanceOf(InvalidRoleChangeError);
    await expect(admin.changeRoles(a.email, ['king' as never], [])).rejects.toBeInstanceOf(InvalidRoleChangeError);
    await expect(admin.changeRoles('nikt@test.local', ['tester'], [])).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it('blokada: login i refresh 401 tą samą treścią co złe hasło; odblokowanie przywraca logowanie', async () => {
    const a = await registerPlayer(t);
    await admin.disable(a.email);
    const blocked = await login(a.email, a.password).expect(401);
    const wrong = await login(a.email, 'zle-haslo-123').expect(401);
    expect(blocked.body.message).toBe(wrong.body.message);
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await admin.enable(a.email);
    await login(a.email, a.password).expect(200);
    // blokada unieważniła refresh tokeny — odblokowanie ich nie przywraca
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  });

  it('zmiana hasła: stare hasło 401, nowe 200, refresh tokeny unieważnione', async () => {
    const a = await registerPlayer(t);
    await admin.setPassword(a.email, 'nowe-haslo-456');
    await login(a.email, a.password).expect(401);
    await login(a.email, 'nowe-haslo-456').expect(200);
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await expect(admin.setPassword(a.email, 'krotkie')).rejects.toThrow(/8 znaków/);
  });

  it('tools/login: 403 bez roli admin, token aud islanders-tools ważny 1 h z nią', async () => {
    const a = await registerPlayer(t);
    await t.publicHttp().post('/v1/auth/tools/login').send({ email: a.email, password: a.password }).expect(403);
    await admin.changeRoles(a.email, ['admin'], []);
    const res = await t.publicHttp().post('/v1/auth/tools/login').send({ email: a.email, password: a.password }).expect(200);
    const jwks = (await t.publicHttp().get('/.well-known/jwks.json')).body;
    const { payload } = await jwtVerify(res.body.accessToken, createLocalJWKSet(jwks), {
      audience: 'islanders-tools',
    });
    expect(payload.exp! - payload.iat!).toBe(3600);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresAt', 'serverTime']);
    await t.publicHttp().post('/v1/auth/tools/login').send({ email: a.email, password: 'zle-haslo-123' }).expect(401);
  });
});
