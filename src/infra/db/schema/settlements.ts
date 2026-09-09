import {
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';
import { biomeType } from './enums.js';
import { players } from './players.js';
import { worlds } from './worlds.js';

const amount = (name: string) =>
  numeric(name, { precision: 14, scale: 4, mode: 'number' }).notNull();

/** Tożsamością osady jest pozycja (ADR 0001 klienta). Biom przechowywany celowo (ADR 0001 backendu). */
export const settlements = pgTable(
  'settlements',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
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
    primaryKey({ name: 'settlements_pk', columns: [t.worldId, t.x, t.y] }),
    unique('settlements_world_xy_biome_unique').on(
      t.worldId,
      t.x,
      t.y,
      t.biome,
    ),
    index('settlements_world_owner_idx').on(t.worldId, t.ownerId),
  ],
);
