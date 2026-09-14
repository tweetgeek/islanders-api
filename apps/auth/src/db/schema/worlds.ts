import { boolean, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { WORLD_STATUSES } from '@islanders/contracts';

export const worldStatus = pgEnum('world_status', WORLD_STATUSES);

export const worlds = pgTable('worlds', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  publicUrl: text('public_url').notNull(),
  adminUrl: text('admin_url').notNull(),
  status: worldStatus('status').notNull(),
  isTest: boolean('is_test').notNull(),
  reachable: boolean('reachable').notNull().default(false),
  lastProbeAt: timestamp('last_probe_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
