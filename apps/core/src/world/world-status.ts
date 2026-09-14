import type { WorldStatus } from '@islanders/contracts';

export type { WorldStatus };

const NATURAL_NEXT: Record<WorldStatus, WorldStatus | null> = {
  DRAFT: 'OPEN',
  OPEN: 'CLOSED',
  CLOSED: 'ENDED',
  ENDED: null,
};

export type StatusChangePlan =
  | { ok: true; forced: boolean }
  | { ok: false; reason: 'SAME_STATUS' | 'NEEDS_FORCE' | 'DRAFT_WITH_PROFILES' };

export function isNaturalTransition(from: WorldStatus, to: WorldStatus): boolean {
  return NATURAL_NEXT[from] === to;
}

/**
 * Reguły zmiany statusu świata. `DRAFT` to świat przygotowywany, zanim ktokolwiek dołączył,
 * więc powrotu do niego nie odblokowuje nawet `--force`, gdy istnieje choć jeden profil.
 */
export function planStatusChange(input: {
  from: WorldStatus;
  to: WorldStatus;
  force: boolean;
  profileCount: number;
}): StatusChangePlan {
  if (input.from === input.to) return { ok: false, reason: 'SAME_STATUS' };
  if (input.to === 'DRAFT' && input.profileCount > 0) {
    return { ok: false, reason: 'DRAFT_WITH_PROFILES' };
  }
  if (isNaturalTransition(input.from, input.to)) return { ok: true, forced: false };
  return input.force ? { ok: true, forced: true } : { ok: false, reason: 'NEEDS_FORCE' };
}
