import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const processedEvents = pgTable('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  worldSlug: text('world_slug').notNull(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
