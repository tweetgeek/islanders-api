import { PlayersAdmin } from '../src/players/players-admin.js';
import { bearer, registerPlayer, registerWorld, serviceToken } from './support/fixtures.js';
import { testServiceClients } from './support/service-clients.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: klienci serwisowi i rejestr światów (e2e)', () => {
  let t: TestApp;
  const { world1, world2, world2Test } = testServiceClients;

  beforeAll(async () => {
    t = await createTestApp();
    await registerWorld(t, world1);
    await registerWorld(t, world2, { status: 'DRAFT' });
    await registerWorld(t, world2Test);
  });
  afterAll(async () => {
    await t.close();
  });

  const listAs = (token: string) =>
    t.publicHttp().get('/v1/worlds').set('Authorization', bearer(token)).expect(200);

  it('client credentials: zły sekret 401, nieznany klient 401, trasa niedostępna publicznie', async () => {
    await t
      .internalHttp()
      .post('/internal/v1/token')
      .send({ clientId: world1.clientId, clientSecret: world2.secret })
      .expect(401);
    await t.internalHttp().post('/internal/v1/token').send({ clientId: 'nikt', clientSecret: 'x' }).expect(401);
    await t
      .publicHttp()
      .post('/internal/v1/token')
      .send({ clientId: world1.clientId, clientSecret: world1.secret })
      .expect(404);
  });

  it('świat nie może zgłosić cudzego sluga', async () => {
    await t
      .internalHttp()
      .put('/internal/v1/worlds/world-2')
      .set('Authorization', bearer(await serviceToken(t, world1)))
      .send({
        name: 'Podszyty',
        publicUrl: 'https://evil.test',
        adminUrl: 'http://evil:3001',
        status: 'OPEN',
        isTest: false,
      })
      .expect(403);
  });

  it('rejestr odrzuca token gracza i ciało niezgodne z kontraktem', async () => {
    const a = await registerPlayer(t);
    await t
      .internalHttp()
      .put('/internal/v1/worlds/world-1')
      .set('Authorization', bearer(a.accessToken))
      .send({})
      .expect(401);
    await t
      .internalHttp()
      .put('/internal/v1/worlds/world-1')
      .set('Authorization', bearer(await serviceToken(t, world1)))
      .send({ name: 'x', publicUrl: 'nie-url', adminUrl: 'http://a:1', status: 'OPEN', isTest: false })
      .expect(400);
  });

  it('gracz widzi otwarte światy bez DRAFT i bez testowych; tester widzi testowy', async () => {
    const player = await registerPlayer(t);
    const asPlayer = await listAs(player.accessToken);
    expect(asPlayer.body.map((w: { slug: string }) => w.slug)).toEqual(['world-1']);
    // `reachable` należy do sondy i zależy od innych plików e2e na tej samej bazie — tu tylko typ.
    expect(Object.keys(asPlayer.body[0]).sort()).toEqual(
      ['isTest', 'joined', 'name', 'publicUrl', 'reachable', 'slug', 'status'],
    );
    expect(asPlayer.body[0]).toMatchObject({
      slug: 'world-1',
      name: 'Świat world-1',
      publicUrl: 'https://world-1.islanders.test',
      status: 'OPEN',
      isTest: false,
      joined: false,
    });
    expect(typeof asPlayer.body[0].reachable).toBe('boolean');

    const tester = await registerPlayer(t);
    await t.app.get(PlayersAdmin).changeRoles(tester.email, ['tester'], []);
    const login = await t
      .publicHttp()
      .post('/v1/auth/login')
      .send({ email: tester.email, password: tester.password })
      .expect(200);
    const asTester = await listAs(login.body.accessToken);
    expect(asTester.body.map((w: { slug: string }) => w.slug)).toEqual(['world-1', 'world-2-test']);
  });

  it('ponowne zgłoszenie aktualizuje wpis', async () => {
    await registerWorld(t, world1, { name: 'Świat pierwszy', status: 'CLOSED' });
    const player = await registerPlayer(t);
    const res = await listAs(player.accessToken);
    expect(res.body[0]).toMatchObject({ slug: 'world-1', name: 'Świat pierwszy', status: 'CLOSED' });
    await registerWorld(t, world1);
  });

  it('lista wymaga tokenu gracza; token serwisowy jest odrzucany', async () => {
    await t.publicHttp().get('/v1/worlds').expect(401);
    await t
      .publicHttp()
      .get('/v1/worlds')
      .set('Authorization', bearer(await serviceToken(t, world1)))
      .expect(401);
  });
});
