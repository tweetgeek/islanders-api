import { eq } from 'drizzle-orm';
import { outbox } from '../src/infra/db/schema/index.js';
import { assertWorldBinding } from '../src/world/world-binding.js';
import { WorldSettingsRepository } from '../src/world/world-settings.repository.js';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.js';
import { installAuthRoutes } from './support/fake-auth-routes.js';
import { joinWorld } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('awarie auth (e2e)', () => {
  it('auth leży: gracz z ważnym tokenem gra, ready = 200, zdarzenie czeka i dociera po powrocie auth', async () => {
    const t = await createTestApp();
    const routes = installAuthRoutes(t.fakeAuth);
    try {
      await t.fakeAuth.stop();
      const p = await signPlayerToken();
      await t.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(200);
      await joinWorld(t, p);
      await t.internalHttp().get('/health/ready').expect(200);

      const dispatcher = t.app.get(OutboxDispatcher);
      expect(await dispatcher.dispatchOnce()).toBe('failed');
      const [pending] = await t.db.select().from(outbox);
      expect(pending).toMatchObject({ attempts: 1, sentAt: null });

      await t.fakeAuth.start();
      await t.db.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1_000) }).where(eq(outbox.id, pending.id));
      expect(await dispatcher.dispatchOnce()).toBe('sent');
      expect(routes.batches[0].events[0]).toMatchObject({ type: 'PlayerJoinedWorld', playerId: p.id });
    } finally {
      await t.close();
    }
  });

  it('świeża replika przy wyłączonym auth weryfikuje tokeny kluczami z Redisa świata', async () => {
    const first = await createTestApp();
    const { fakeAuth, databaseUrl, slug } = first;
    await first.close();
    // `close` pierwszej aplikacji zamknął jej fałszywy auth — nowa replika startuje bez auth.
    const replica = await createTestApp({ databaseUrl, world: { slug }, fakeAuth });
    try {
      const p = await signPlayerToken();
      await replica.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(200);
    } finally {
      await replica.close();
    }
  });

  it('start z niezgodnym WORLD_SLUG kończy się błędem powiązania', async () => {
    const t = await createTestApp();
    try {
      await expect(assertWorldBinding(t.app.get(WorldSettingsRepository), 'world-inny')).rejects.toThrow(
        /world-inny/,
      );
    } finally {
      await t.close();
    }
  });
});
