import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { missionType } from './enums.js';
import { profiles } from './profiles.js';

export type FleetCargo = {
  units: Record<string, number>;
  resources: Record<string, number>;
};

export const fleets = pgTable(
  'fleets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.playerId, { onDelete: 'cascade' }),
    mission: missionType('mission').notNull(),
    fromX: integer('from_x').notNull(),
    fromY: integer('from_y').notNull(),
    toX: integer('to_x').notNull(),
    toY: integer('to_y').notNull(),
    ships: jsonb('ships').$type<Record<string, number>>().notNull().default({}),
    cargo: jsonb('cargo')
      .$type<FleetCargo>()
      .notNull()
      .default({ units: {}, resources: {} }),
    departAt: timestamp('depart_at', { withTimezone: true }).notNull(),
    arriveAt: timestamp('arrive_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('fleets_owner_idx').on(t.ownerId),
    index('fleets_target_idx').on(t.toX, t.toY),
  ],
);
