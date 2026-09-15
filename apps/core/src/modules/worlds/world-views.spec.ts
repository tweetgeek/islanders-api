import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import type { ProfileRow } from '../profiles/profiles.repository.js';
import { worldView } from './world-views.js';

const world: WorldSettingsRow = {
  id: 1, slug: 'world-1', name: 'Świat 1', status: 'OPEN', isTest: false, seed: 1337,
  width: 200, height: 100, windX: 0.3, windY: -0.1,
  createdAt: new Date('2026-09-14T00:00:00Z'), updatedAt: new Date('2026-09-14T00:00:00Z'),
};
const profile = (home: { x: number; y: number } | null): ProfileRow => ({
  playerId: '00000000-0000-4000-8000-000000000001',
  nickname: 'kapitan',
  homeX: home?.x ?? null,
  homeY: home?.y ?? null,
  joinedAt: new Date('2026-09-14T00:00:00Z'),
});

describe('worldView', () => {
  it('bez profilu: dane publiczne i profile = null', () => {
    expect(worldView(world, undefined)).toEqual({
      slug: 'world-1', name: 'Świat 1', status: 'OPEN', isTest: false, seed: 1337,
      size: { w: 200, h: 100 }, wind: { x: 0.3, y: -0.1 }, profile: null,
    });
  });

  it('z profilem i osadą domową', () => {
    expect(worldView(world, profile({ x: 5, y: 7 })).profile).toEqual({
      playerId: '00000000-0000-4000-8000-000000000001',
      homeSettlement: { x: 5, y: 7 },
    });
  });

  it('z profilem bez osady domowej', () => {
    expect(worldView(world, profile(null)).profile?.homeSettlement).toBeNull();
  });
});
