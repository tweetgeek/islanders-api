import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import type { ProfileRow } from '../profiles/profiles.repository.js';

export interface WorldView {
  slug: string;
  name: string;
  status: WorldSettingsRow['status'];
  isTest: boolean;
  /** Do etapu 3 klient liczy geografię z seeda. */
  seed: number;
  size: { w: number; h: number };
  wind: { x: number; y: number };
  profile: { playerId: string; homeSettlement: { x: number; y: number } | null } | null;
}

/** `GET /v1/world`: dane publiczne świata i profil gracza albo `null` przed dołączeniem. `serverTime` dokłada interceptor. */
export function worldView(world: WorldSettingsRow, profile: ProfileRow | undefined): WorldView {
  return {
    slug: world.slug,
    name: world.name,
    status: world.status,
    isTest: world.isTest,
    seed: world.seed,
    size: { w: world.width, h: world.height },
    wind: { x: world.windX, y: world.windY },
    profile: profile
      ? {
          playerId: profile.playerId,
          homeSettlement:
            profile.homeX === null || profile.homeY === null ? null : { x: profile.homeX, y: profile.homeY },
        }
      : null,
  };
}
