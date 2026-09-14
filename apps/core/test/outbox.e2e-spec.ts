import { eq } from 'drizzle-orm';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.js';
import { WorldRegistrar } from '../src/outbox/world-registrar.js';
import { WorldStatusService } from '../src/world/world-status.service.js';
import { outbox } from '../src/infra/db/schema/index.js';
import { startFakeAuth } from './support/fake-auth.js';
import { joinWorld } from './support/fixtures.js';
import { installAuthRoutes } from './support/fake-auth-routes.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken, signToolsToken } from './support/tokens.js';

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('warunek nie spełniony w czasie');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('outbox i zgłoszenie świata (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  it('dołączenie zapisuje PlayerJoinedWorld, a wysyłacz dostarcza je do auth jednym żądaniem z tokenem serwisowym', async () => {
    const routes = installAuthRoutes(t.fakeAuth);
    const p = await signPlayerToken();
    await joinWorld(t, p);
    expect(await app(t).dispatchOnce()).toBe('sent');
    expect(routes.batches).toHaveLength(1);
    expect(routes.batches[0].events).toEqual([
      expect.objectContaining({ type: 'PlayerJoinedWorld', playerId: p.id, worldSlug: t.slug }),
    ]);
    const [row] = await t.db.select().from(outbox);
    expect(row.sentAt).not.toBeNull();
    expect(await app(t).dispatchOnce()).toBe('idle');
    expect(routes.tokenRequests).toBe(1);
  });

  it('zmiana statusu świata dociera jako WorldStatusChanged', async () => {
    const routes = installAuthRoutes(t.fakeAuth);
    await t.app.get(WorldStatusService).change('CLOSED', { force: false });
    await app(t).dispatchOnce();
    expect(routes.batches[0].events[0]).toMatchObject({ type: 'WorldStatusChanged', status: 'CLOSED' });
  });

  it('409 z auth: próba zapisana z backoffem, kolejne zdarzenia czekają za najstarszym', async () => {
    const routes = installAuthRoutes(t.fakeAuth, { eventsStatus: 409 });
    await joinWorld(t, await signPlayerToken());
    await joinWorld(t, await signPlayerToken());
    expect(await app(t).dispatchOnce()).toBe('failed');
    const rows = await t.db.select().from(outbox).orderBy(outbox.createdAt);
    expect(rows[0]).toMatchObject({ attempts: 1, sentAt: null });
    expect(rows[0].nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(rows[1]).toMatchObject({ attempts: 0, sentAt: null });
    routes.set({ eventsStatus: 200 });
    expect(await app(t).dispatchOnce()).toBe('idle');
    await t.db.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1_000) }).where(eq(outbox.id, rows[0].id));
    expect(await app(t).dispatchOnce()).toBe('sent');
    expect(routes.batches[0].events).toHaveLength(2);
  });

  it('API admina pokazuje zaległości outboxa', async () => {
    installAuthRoutes(t.fakeAuth, { eventsStatus: 503 });
    await joinWorld(t, await signPlayerToken());
    const res = await t.internalHttp().get('/admin/v1/world').set('Authorization', bearer(await signToolsToken())).expect(200);
    expect(res.body.outbox).toMatchObject({ pending: 1, oldestPendingAt: expect.any(String) });
  });

  it('rola api nie planuje prac w tle; rola all zgłasza świat przy starcie i planuje wysyłacz', async () => {
    expect(t.app.get(OutboxDispatcher).isScheduled()).toBe(false);
    expect(t.app.get(WorldRegistrar).isScheduled()).toBe(false);

    const auth = await startFakeAuth();
    const routes = installAuthRoutes(auth);
    const all = await createTestApp({ fakeAuth: auth, env: { CORE_ROLE: 'all' } });
    try {
      await waitFor(() => routes.registrations.length > 0);
      expect(routes.registrations[0]).toEqual({
        slug: all.slug,
        body: { name: 'Świat testowy', publicUrl: `https://${all.slug}.islanders.test`, adminUrl: 'http://127.0.0.1:3101', status: 'OPEN', isTest: false },
      });
      expect(all.app.get(OutboxDispatcher).isScheduled()).toBe(true);
      await joinWorld(all, await signPlayerToken());
      await waitFor(() => routes.batches.length > 0);
    } finally {
      await all.close();
      await auth.close();
    }
  });
});

function app(t: TestApp): OutboxDispatcher {
  return t.app.get(OutboxDispatcher);
}
