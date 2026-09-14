import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PlayerPrincipal } from '../src/access/player-request.js';
import { JoinService } from '../src/modules/worlds/join.service.js';
import { profiles, worldSettings } from '../src/infra/db/schema/index.js';
import { WorldStatusService } from '../src/world/world-status.service.js';
import { createTestApp, type TestApp } from './support/test-app.js';

/**
 * `PlayerTokenGuard` czyta świat bez blokady przed kontrolerem. Ten test dowodzi, że sam
 * `JoinService.join` nie ufa temu zdjęciu: gdy status w bazie zmienił się w międzyczasie
 * (tu: przez `WorldStatusService.change`, który bierze FOR UPDATE), transakcja join bierze
 * FOR SHARE na tym samym wierszu i odrzuca dołączenie mimo „świeżo nieaktualnego” obiektu świata.
 */
describe('JoinService kontra WorldStatusService — wyścig o status świata (e2e)', () => {
  let t: TestApp;
  const player: PlayerPrincipal = {
    id: '00000000-0000-4000-8000-000000000099',
    roles: ['player'],
    nickname: 'wyscigowiec',
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('join ze starym snapshotem OPEN jest odrzucony 409 po change("CLOSED")', async () => {
    const staleOpenSnapshot = (await t.db.select().from(worldSettings))[0];
    expect(staleOpenSnapshot.status).toBe('OPEN');

    await t.app.get(WorldStatusService).change('CLOSED', { force: false });

    const join = t.app.get(JoinService);
    await expect(join.join(staleOpenSnapshot, player)).rejects.toBeInstanceOf(ConflictException);
    await expect(join.join(staleOpenSnapshot, player)).rejects.toThrow(/Świat nie przyjmuje nowych graczy/);

    const inserted = await t.db.select().from(profiles).where(eq(profiles.playerId, player.id));
    expect(inserted).toHaveLength(0);
  });
});
