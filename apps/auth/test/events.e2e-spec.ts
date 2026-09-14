import { randomUUID } from 'node:crypto';
import {
  bearer,
  registerPlayer,
  registerWorld,
  serviceToken,
} from './support/fixtures.js';
import { testServiceClients } from './support/service-clients.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: zdarzenia od światów (e2e)', () => {
  let t: TestApp;
  const { world1, unregistered } = testServiceClients;

  beforeAll(async () => {
    t = await createTestApp();
    await registerWorld(t, world1);
  });
  afterAll(async () => {
    await t.close();
  });

  const at = '2026-09-13T12:00:00.000Z';
  const joined = (playerId: string, slug = 'world-1') => ({
    type: 'PlayerJoinedWorld',
    eventId: randomUUID(),
    worldSlug: slug,
    occurredAt: at,
    playerId,
    joinedAt: at,
  });
  const statusChanged = (status: string) => ({
    type: 'WorldStatusChanged',
    eventId: randomUUID(),
    worldSlug: 'world-1',
    occurredAt: at,
    status,
  });
  const worldStatus = async (token: string) => {
    const res = await t
      .publicHttp()
      .get('/v1/worlds')
      .set('Authorization', bearer(token))
      .expect(200);
    return res.body.find((w: { slug: string }) => w.slug === 'world-1').status;
  };
  const send = async (client: typeof world1, events: object[]) =>
    t
      .internalHttp()
      .post('/internal/v1/events')
      .set('Authorization', bearer(await serviceToken(t, client)))
      .send({ events });
  const joinedFlag = async (token: string) => {
    const res = await t
      .publicHttp()
      .get('/v1/worlds')
      .set('Authorization', bearer(token))
      .expect(200);
    return res.body.find((w: { slug: string }) => w.slug === 'world-1').joined;
  };

  it('PlayerJoinedWorld ustawia joined; powtórne dołączenie tego samego gracza niczego nie psuje', async () => {
    const a = await registerPlayer(t);
    expect(await joinedFlag(a.accessToken)).toBe(false);
    expect((await send(world1, [joined(a.playerId)])).body).toMatchObject({
      accepted: 1,
      duplicates: 0,
    });
    expect(await joinedFlag(a.accessToken)).toBe(true);
    expect((await send(world1, [joined(a.playerId)])).body).toMatchObject({
      accepted: 1,
      duplicates: 0,
    });
    expect(await joinedFlag(a.accessToken)).toBe(true);
  });

  it('WorldStatusChanged zmienia status w rejestrze', async () => {
    const a = await registerPlayer(t);
    await send(world1, [statusChanged('CLOSED')]).then((r) =>
      expect(r.status).toBe(200),
    );
    expect(await worldStatus(a.accessToken)).toBe('CLOSED');
    await registerWorld(t, world1);
  });

  it('ta sama partia wysłana dwa razy zmienia stan raz', async () => {
    const a = await registerPlayer(t);
    const batch = [statusChanged('CLOSED'), joined(a.playerId)];
    expect((await send(world1, batch)).body).toMatchObject({
      accepted: 2,
      duplicates: 0,
    });
    // Świat wraca do OPEN nowszym zgłoszeniem; powtórka starej partii nie może go znów zamknąć.
    await registerWorld(t, world1);
    expect((await send(world1, batch)).body).toMatchObject({
      accepted: 0,
      duplicates: 2,
    });
    expect(await worldStatus(a.accessToken)).toBe('OPEN');
    expect(await joinedFlag(a.accessToken)).toBe(true);
  });

  it('zdarzenie cudzego świata odrzuca całą partię (403), świat spoza rejestru daje 409', async () => {
    const a = await registerPlayer(t);
    expect(
      (await send(world1, [joined(a.playerId), joined(a.playerId, 'world-2')]))
        .status,
    ).toBe(403);
    expect(await joinedFlag(a.accessToken)).toBe(false);
    expect(
      (await send(unregistered, [joined(a.playerId, 'world-9')])).status,
    ).toBe(409);
  });

  it('nieznane konto: zdarzenie przyjęte jako przetworzone i pominięte, żeby nie blokować outboxa', async () => {
    const res = await send(world1, [joined(randomUUID())]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accepted: 1, duplicates: 0 });
  });

  it('partia niezgodna z kontraktem -> 400', async () => {
    expect((await send(world1, [])).status).toBe(400);
  });
});
