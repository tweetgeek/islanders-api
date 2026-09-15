import type { AuthClient } from '../auth-client/auth-client.js';
import type { Env } from '../infra/config/env.js';
import type { WorldSettingsRepository } from '../world/world-settings.repository.js';
import { WorldRegistrar } from './world-registrar.js';

const env = { PUBLIC_URL: 'https://world-1.test', ADMIN_URL: 'http://127.0.0.1:3101' } as unknown as Env;

describe('WorldRegistrar.registerOnce — odporność na błędy', () => {
  it('gdy odczyt świata się nie powiedzie (np. baza padła), zwraca false i nie rzuca', async () => {
    const registerWorld = vi.fn();
    const auth = { registerWorld } as unknown as AuthClient;
    const worlds = { get: () => Promise.reject(new Error('baza padła')) } as unknown as WorldSettingsRepository;
    const registrar = new WorldRegistrar(auth, worlds, env);

    await expect(registrar.registerOnce()).resolves.toBe(false);
    expect(registerWorld).not.toHaveBeenCalled();
  });

  it('gdy wywołanie auth rzuca, zwraca false i nie rzuca', async () => {
    const auth = { registerWorld: () => Promise.reject(new Error('sieć padła')) } as unknown as AuthClient;
    const worlds = {
      get: () => Promise.resolve({ slug: 'world-1', name: 'Świat', status: 'OPEN', isTest: false }),
    } as unknown as WorldSettingsRepository;
    const registrar = new WorldRegistrar(auth, worlds, env);

    await expect(registrar.registerOnce()).resolves.toBe(false);
  });
});
