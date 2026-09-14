import { Inject, Injectable } from '@nestjs/common';
import { count } from 'drizzle-orm';
import type { Clock } from '@islanders/domain/time';
import { DB, type Db } from '../infra/db/db.module.js';
import { profiles } from '../infra/db/schema/index.js';
import { CLOCK } from '../infra/time/time.module.js';
import { worldStatusChangedEvent } from '../outbox/events.js';
import { OutboxRepository } from '../outbox/outbox.repository.js';
import { WorldNotInitializedError, WorldSettingsRepository } from './world-settings.repository.js';
import { type WorldStatus, planStatusChange } from './world-status.js';

const REASON_MESSAGES = {
  SAME_STATUS: 'Świat ma już ten status',
  NEEDS_FORCE: 'To przejście wymaga --force',
  DRAFT_WITH_PROFILES: 'Nie można wrócić do DRAFT: świat ma już profile graczy',
} as const;

export class StatusChangeRejectedError extends Error {
  constructor(
    readonly reason: keyof typeof REASON_MESSAGES,
    from: WorldStatus,
    to: WorldStatus,
  ) {
    super(`${REASON_MESSAGES[reason]} (${from} → ${to})`);
    this.name = 'StatusChangeRejectedError';
  }
}

@Injectable()
export class WorldStatusService {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly outbox: OutboxRepository,
  ) {}

  /** Zmiana statusu pod blokadą wiersza świata, żeby dwa równoległe polecenia nie ominęły reguł. */
  change(to: WorldStatus, options: { force: boolean }): Promise<{ from: WorldStatus; to: WorldStatus; forced: boolean }> {
    return this.db.transaction(async (tx) => {
      const world = await this.worlds.findForUpdate(tx);
      if (!world) throw new WorldNotInitializedError();
      const [{ value }] = await tx.select({ value: count() }).from(profiles);
      const plan = planStatusChange({ from: world.status, to, force: options.force, profileCount: Number(value) });
      if (!plan.ok) throw new StatusChangeRejectedError(plan.reason, world.status, to);
      const now = this.clock.now();
      await this.worlds.setStatus(tx, to, now);
      await this.outbox.add(tx, worldStatusChangedEvent(world.slug, to, now));
      return { from: world.status, to, forced: plan.forced };
    });
  }
}
