import { WorldBindingError, assertWorldBinding } from './world-binding.js';
import type { WorldSettingsRepository, WorldSettingsRow } from './world-settings.repository.js';

const repo = (row: Partial<WorldSettingsRow> | undefined) =>
  ({ find: () => Promise.resolve(row) }) as unknown as WorldSettingsRepository;

describe('assertWorldBinding', () => {
  it('brak świata w bazie -> błąd z instrukcją world:init', async () => {
    await expect(assertWorldBinding(repo(undefined), 'world-1')).rejects.toThrow(/world:init/);
  });
  it('slug bazy różny od WORLD_SLUG -> błąd z oboma slugami', async () => {
    const err = await assertWorldBinding(repo({ slug: 'world-2' }), 'world-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorldBindingError);
    expect((err as Error).message).toMatch(/world-2.*world-1/);
  });
  it('zgodny slug -> zwraca wiersz', async () => {
    await expect(assertWorldBinding(repo({ slug: 'world-1' }), 'world-1')).resolves.toMatchObject({ slug: 'world-1' });
  });
});
