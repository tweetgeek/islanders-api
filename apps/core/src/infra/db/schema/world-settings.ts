import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { worldStatus } from './enums.js';

/** Jeden wiersz: tożsamość i ustawienia świata obsługiwanego przez ten core (ADR 0006). */
export const worldSettings = pgTable(
  'world_settings',
  {
    id: smallint('id').primaryKey().default(1),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: worldStatus('status').notNull().default('DRAFT'),
    isTest: boolean('is_test').notNull().default(false),
    // Do etapu 3 geografia liczy się z seeda; kolumny generatora zastąpią te trzy pola.
    seed: integer('seed').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    windX: doublePrecision('wind_x').notNull().default(0),
    windY: doublePrecision('wind_y').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('world_settings_singleton', sql`${t.id} = 1`),
    check('world_settings_seed_31bit', sql`${t.seed} >= 0 AND ${t.seed} <= 2147483647`),
    check('world_settings_size_positive', sql`${t.width} > 0 AND ${t.height} > 0`),
  ],
);
