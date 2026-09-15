import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, inArray, isNotNull, isNull, lt, min } from 'drizzle-orm';
import type { WorldEvent } from '@islanders/contracts';
import { DB, type Db, type DbClient } from '../infra/db/db.module.js';
import { outbox } from '../infra/db/schema/index.js';

export type OutboxRow = typeof outbox.$inferSelect;

@Injectable()
export class OutboxRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** W transakcji zmiany, która wywołała zdarzenie. */
  async add(client: DbClient, event: WorldEvent): Promise<void> {
    await client.insert(outbox).values({ id: event.eventId, type: event.type, payload: event });
  }

  /**
   * Najstarsze niewysłane zdarzenia, ale tylko gdy najstarsze z nich już może być ponowione:
   * kolejność w obrębie świata ma pierwszeństwo przed przepustowością.
   */
  async dueBatch(now: Date, limit: number): Promise<OutboxRow[]> {
    const rows = await this.db
      .select()
      .from(outbox)
      .where(isNull(outbox.sentAt))
      .orderBy(asc(outbox.createdAt), asc(outbox.id))
      .limit(limit);
    const head = rows[0];
    if (!head || (head.nextAttemptAt && head.nextAttemptAt.getTime() > now.getTime())) return [];
    return rows;
  }

  async markSent(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db.update(outbox).set({ sentAt: now }).where(inArray(outbox.id, ids));
  }

  async recordFailure(id: string, attempts: number, nextAttemptAt: Date, error: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({ attempts, nextAttemptAt, lastError: error.slice(0, 500) })
      .where(inArray(outbox.id, [id]));
  }

  async deleteSentBefore(date: Date): Promise<number> {
    const deleted = await this.db
      .delete(outbox)
      .where(and(isNotNull(outbox.sentAt), lt(outbox.sentAt, date)))
      .returning({ id: outbox.id });
    return deleted.length;
  }

  async stats(): Promise<{ pending: number; oldestPendingAt: Date | null }> {
    const [row] = await this.db
      .select({ pending: count(), oldest: min(outbox.createdAt) })
      .from(outbox)
      .where(isNull(outbox.sentAt));
    return { pending: Number(row.pending), oldestPendingAt: row.oldest ?? null };
  }
}
