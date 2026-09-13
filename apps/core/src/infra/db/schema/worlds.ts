import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  integer,
  pgTable,
  serial,
  timestamp,
} from 'drizzle-orm/pg-core';
import { worldStatus } from './enums.js';

export const worlds = pgTable(
  'worlds',
  {
    id: serial('id').primaryKey(),
    seed: integer('seed').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    windX: doublePrecision('wind_x').notNull().default(0),
    windY: doublePrecision('wind_y').notNull().default(0),
    status: worldStatus('status').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('worlds_seed_31bit', sql`${t.seed} >= 0 AND ${t.seed} <= 2147483647`),
  ],
);
