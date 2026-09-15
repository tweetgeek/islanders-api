import type { WorldSettingsRepository, WorldSettingsRow } from './world-settings.repository.js';

export class WorldBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldBindingError';
  }
}

/**
 * Baza jest źródłem prawdy o świecie (ADR 0004, 0006); `WORLD_SLUG` z konfiguracji tylko potwierdza,
 * że proces podpięto do właściwej bazy. Niezgodność to błąd startu, nie ostrzeżenie.
 */
export async function assertWorldBinding(
  repo: WorldSettingsRepository,
  expectedSlug: string,
): Promise<WorldSettingsRow> {
  const row = await repo.find();
  if (!row) {
    throw new WorldBindingError('Baza nie ma świata — uruchom world:init');
  }
  if (row.slug !== expectedSlug) {
    throw new WorldBindingError(
      `Baza należy do świata ${row.slug}, a WORLD_SLUG wskazuje ${expectedSlug}`,
    );
  }
  return row;
}
