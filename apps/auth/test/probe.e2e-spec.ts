import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeServer } from '@islanders/platform';
import { WorldProbe } from '../src/probe/world-probe.js';
import { bearer, registerPlayer, registerWorld } from './support/fixtures.js';
import { testServiceClients } from './support/service-clients.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: sonda światów (e2e)', () => {
  let t: TestApp;
  let fakeCore: Server;
  let port: number;
  let readyStatus = 200;
  let delayMs = 0;

  beforeAll(async () => {
    fakeCore = createServer((req, res) => {
      setTimeout(() => {
        res.statusCode = req.url === '/health/ready' ? readyStatus : 404;
        res.end();
      }, delayMs);
    });
    await new Promise<void>((resolve) => fakeCore.listen(0, '127.0.0.1', resolve));
    port = (fakeCore.address() as AddressInfo).port;
    t = await createTestApp();
    await registerWorld(t, testServiceClients.world1, { adminUrl: `http://127.0.0.1:${port}` });
  });
  afterAll(async () => {
    await t.close();
    await closeServer(fakeCore);
  });

  const reachable = async () => {
    const a = await registerPlayer(t);
    const res = await t.publicHttp().get('/v1/worlds').set('Authorization', bearer(a.accessToken)).expect(200);
    return res.body.find((w: { slug: string }) => w.slug === 'world-1').reachable;
  };

  // Musi być pierwszym testem w tym pliku: liczy na to, że żaden świat nie był jeszcze sondowany
  // (last_probe_at = NULL) — tylko ten plik wywołuje WorldProbe.probeOnce(), a t (WORLD_PROBE_INTERVAL
  // '0s') nigdy nie sonduje sam z siebie (scheduler wyłączony przy interwale 0), więc kolejność
  // wewnątrz tego pliku jest jedynym warunkiem.
  it('sonda pracuje raz na usługę: drugi przebieg w oknie WORLD_PROBE_INTERVAL jest pomijany', async () => {
    readyStatus = 200;
    delayMs = 0;
    const t2 = await createTestApp({ env: { WORLD_PROBE_INTERVAL: '30s' } });
    try {
      const probe = t2.app.get(WorldProbe);
      expect(await probe.probeOnce()).toBe(true);
      expect(await probe.probeOnce()).toBe(false);
    } finally {
      await t2.close();
    }
  });

  it('200 z health/ready -> reachable true; 503 -> false', async () => {
    readyStatus = 200;
    expect(await t.app.get(WorldProbe).probeOnce()).toBe(true);
    expect(await reachable()).toBe(true);
    readyStatus = 503;
    await t.app.get(WorldProbe).probeOnce();
    expect(await reachable()).toBe(false);
  });

  it('dwa równoległe przebiegi: jeden pracuje, drugi pomija cykl pod blokadą', async () => {
    readyStatus = 200;
    delayMs = 300;
    try {
      const probe = t.app.get(WorldProbe);
      const results = await Promise.all([probe.probeOnce(), probe.probeOnce()]);
      expect(results.sort()).toEqual([false, true]);
    } finally {
      delayMs = 0;
    }
  });

  it('świat, który nie odpowiada w 2 s, jest niedostępny', async () => {
    readyStatus = 200;
    delayMs = 2_500;
    try {
      await t.app.get(WorldProbe).probeOnce();
      expect(await reachable()).toBe(false);
    } finally {
      delayMs = 0;
    }
  });
});
