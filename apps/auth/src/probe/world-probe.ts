import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Sql } from 'postgres';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, PG_CLIENT, withAdvisoryLock } from '@islanders/platform';
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
  ) {}

  async probeOnce(): Promise<boolean> {
    const result = await withAdvisoryLock(this.sql, WORLD_PROBE_LOCK_KEY, async () => {
      const worlds = await this.worlds.listAll();
      await Promise.all(worlds.map((w) => this.probeWorld(w)));
    });
    return result.acquired;
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
