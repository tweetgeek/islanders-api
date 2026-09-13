import type { ProfileRow } from './profiles.repository.js';
import type { WorldRow } from './worlds.repository.js';

export interface WorldListItem {
  id: string;
  seed: number;
  size: { w: number; h: number };
  wind: { x: number; y: number };
  status: WorldRow['status'];
  joined: boolean;
}

export interface WorldStateView extends Omit<WorldListItem, 'joined'> {
  playerId: number;
  homeSettlement: { x: number; y: number } | null;
}

function base(world: WorldRow): Omit<WorldListItem, 'joined'> {
  return {
    id: String(world.id),
    seed: world.seed,
    size: { w: world.width, h: world.height },
    wind: { x: world.windX, y: world.windY },
    status: world.status,
  };
}

export function worldListItem(world: WorldRow, joined: boolean): WorldListItem {
  return { ...base(world), joined };
}

/** Kształt z sekcji 4.1 specu klienta; `serverTime` dokłada interceptor. */
export function worldState(
  world: WorldRow,
  profile: ProfileRow,
  playerId: number,
): WorldStateView {
  return {
    ...base(world),
    playerId,
    homeSettlement:
      profile.homeX === null || profile.homeY === null
        ? null
        : { x: profile.homeX, y: profile.homeY },
  };
}
