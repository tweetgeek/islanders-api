import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { biomeType } from './enums.js';
import { profiles } from './profiles.js';

const amount = (name: string) =>
  numeric(name, { precision: 14, scale: 4, mode: 'number' }).notNull();

/** Tożsamością osady jest pozycja (ADR 0001 klienta). Biom przechowywany celowo (ADR 0001 API). */
export const settlements = pgTable(
  'settlements',
  {
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.playerId, { onDelete: 'cascade' }),
    name: varchar('name', { length: 32 }).notNull(),
    biome: biomeType('biome').notNull(),
    wood: amount('wood'),
    stone: amount('stone'),
    food: amount('food'),
    iron: amount('iron'),
    sulfur: amount('sulfur'),
    population: integer('population').notNull().default(0),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }).notNull(),
    foundedAt: timestamp('founded_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'settlements_pk', columns: [t.x, t.y] }),
    unique('settlements_xy_biome_unique').on(t.x, t.y, t.biome),
    index('settlements_owner_idx').on(t.ownerId),
  ],
);
