import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Zdarzenia dla auth, zapisywane w transakcji zmiany, która je wywołała (ADR 0007). `id` = `eventId`. */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_pending_idx').on(t.createdAt).where(sql`${t.sentAt} IS NULL`)],
);
