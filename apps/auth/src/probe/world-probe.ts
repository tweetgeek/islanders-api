import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Sql } from 'postgres';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV, PG_CLIENT, withAdvisoryLock } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { WorldsRepository, type WorldRow } from '../worlds/worlds.repository.js';

export const WORLD_PROBE_LOCK_KEY = 71_001;
const PROBE_TIMEOUT_MS = 2_000;

/** Wynik sondy zmienia wyłącznie `reachable`, nigdy `status` świata. */
@Injectable()
export class WorldProbe {
  private readonly logger = new Logger(WorldProbe.name);

  constructor(
    private readonly worlds: WorldsRepository,
    @Inject(PG_CLIENT) private readonly sql: Sql,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: AuthEnv,
  ) {}

  /**
   * Zwraca `true`, jeśli to wywołanie faktycznie odpytało światy. `false` znaczy „nic nowego”:
   * albo inna replika trzyma blokadę, albo — pod blokadą — okazało się, że jakaś replika już
   * odpytała światy w bieżącym oknie `WORLD_PROBE_INTERVAL` (sonda ma działać raz na usługę,
   * nie raz na replikę).
   */
  async probeOnce(): Promise<boolean> {
    const result = await withAdvisoryLock(this.sql, WORLD_PROBE_LOCK_KEY, async () => {
      const worlds = await this.worlds.listAll();
      if (this.probedRecently(worlds)) return false;
      await Promise.all(worlds.map((w) => this.probeWorld(w)));
      return true;
    });
    return result.acquired && result.value;
  }

  /** `WORLD_PROBE_INTERVAL` = 0 (testy) nigdy nie pomija cyklu. */
  private probedRecently(worlds: WorldRow[]): boolean {
    if (this.env.WORLD_PROBE_INTERVAL <= 0) return false;
    const mostRecent = worlds.reduce<Date | null>((acc, w) => {
      if (!w.lastProbeAt) return acc;
      return !acc || w.lastProbeAt > acc ? w.lastProbeAt : acc;
    }, null);
    if (!mostRecent) return false;
    const elapsedMs = this.clock.now().getTime() - mostRecent.getTime();
    return elapsedMs < this.env.WORLD_PROBE_INTERVAL * 1000;
  }

  private async probeWorld(world: WorldRow): Promise<void> {
    let reachable = false;
    try {
      const res = await fetch(new URL('/health/ready', world.adminUrl), {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    if (!reachable && world.reachable) {
      this.logger.warn(`Świat ${world.slug} przestał odpowiadać`);
    }
    await this.worlds.setReachable(world.slug, reachable, this.clock.now());
  }
}
