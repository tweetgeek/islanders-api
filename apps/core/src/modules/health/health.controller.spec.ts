import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('nie wisi w nieskończoność, gdy Redis nie odpowiada — 503 w granicach limitu czasu', async () => {
    vi.useFakeTimers();
    const db = { execute: vi.fn().mockResolvedValue(undefined) } as never;
    // ping() nigdy się nie rozwiązuje — tak zachowuje się klient z maxRetriesPerRequest: null
    // przy zerwanym połączeniu.
    const redis = { ping: vi.fn(() => new Promise(() => {})) } as never;
    const controller = new HealthController(db, redis);

    const result = controller.check();
    const assertion = expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});
