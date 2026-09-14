import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import type { WorldEvent } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV, PG_CLIENT, withAdvisoryLock } from '@islanders/platform';
import { AuthClient, AuthUnavailableError, CONTRACT_ERROR_STATUSES } from '../auth-client/auth-client.js';
import { backoffDelayMs } from '../auth-client/backoff.js';
import type { Env } from '../infra/config/env.js';
import { runsBackgroundJobs } from '../infra/config/roles.js';
import { OutboxRepository } from './outbox.repository.js';

export const OUTBOX_INTERVAL_MS = 2_000;
export const OUTBOX_LOCK_KEY = 72_001;
export const OUTBOX_BATCH = 100;
export const OUTBOX_RETENTION_MS = 7 * 24 * 3_600_000;
export const OUTBOX_STALE_MS = 15 * 60_000;
const STALE_WARNING_EVERY_MS = 60_000;

/** Wysyła zdarzenia do auth „co najmniej raz”, w kolejności, jedną repliką naraz (ADR 0007). */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStaleWarning = 0;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly auth: AuthClient,
    @Inject(PG_CLIENT) private readonly sql: Sql,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    if (!runsBackgroundJobs(this.env)) return;
    this.timer = setInterval(() => void this.tick(), OUTBOX_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  isScheduled(): boolean {
    return this.timer !== undefined;
  }

  async dispatchOnce(): Promise<'locked' | 'idle' | 'sent' | 'failed'> {
    const result = await withAdvisoryLock(this.sql, OUTBOX_LOCK_KEY, () => this.dispatchLocked());
    return result.acquired ? result.value : 'locked';
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchOnce();
    } catch (err) {
      this.logger.error('Cykl wysyłacza outboxa nie powiódł się', err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }

  private async dispatchLocked(): Promise<'idle' | 'sent' | 'failed'> {
    const now = this.clock.now();
    await this.outbox.deleteSentBefore(new Date(now.getTime() - OUTBOX_RETENTION_MS));
    await this.warnIfStale(now);
    const batch = await this.outbox.dueBatch(now, OUTBOX_BATCH);
    if (batch.length === 0) return 'idle';
    const head = batch[0];
    let status: number | null = null;
    let error: string;
    try {
      const res = await this.auth.sendEvents({ events: batch.map((r) => r.payload as WorldEvent) });
      if (res.status === 200) {
        await this.outbox.markSent(batch.map((r) => r.id), this.clock.now());
        return 'sent';
      }
      status = res.status;
      error = `HTTP ${res.status}`;
    } catch (err) {
      if (err instanceof AuthUnavailableError && err.status !== undefined) status = err.status;
      error = err instanceof Error ? err.message : String(err);
    }
    const attempts = head.attempts + 1;
    const nextAttemptAt = new Date(now.getTime() + backoffDelayMs(attempts, Math.random));
    await this.outbox.recordFailure(head.id, attempts, nextAttemptAt, error);
    const message = `Wysyłka ${batch.length} zdarzeń do auth nieudana (próba ${attempts}): ${error}`;
    if (status !== null && CONTRACT_ERROR_STATUSES.has(status)) this.logger.error(message);
    else this.logger.warn(message);
    return 'failed';
  }

  private async warnIfStale(now: Date): Promise<void> {
    if (now.getTime() - this.lastStaleWarning < STALE_WARNING_EVERY_MS) return;
    const { oldestPendingAt, pending } = await this.outbox.stats();
    if (oldestPendingAt && now.getTime() - oldestPendingAt.getTime() > OUTBOX_STALE_MS) {
      this.lastStaleWarning = now.getTime();
      this.logger.warn(`Outbox: ${pending} niewysłanych zdarzeń, najstarsze z ${oldestPendingAt.toISOString()}`);
    }
  }
}
