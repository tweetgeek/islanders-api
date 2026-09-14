import { integer, numeric, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { worlds } from './worlds.js';

const taken = (name: string) =>
  numeric(name, { precision: 14, scale: 4, mode: 'number' })
    .notNull()
    .default(0);

/** Odchylenie od znaleziska wyliczonego z seeda: ile już zabrano. Używane od specu C. */
export const depositsTaken = pgTable(
  'deposits_taken',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    wood: taken('wood'),
    stone: taken('stone'),
    food: taken('food'),
    iron: taken('iron'),
    sulfur: taken('sulfur'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.x, t.y] })],
);
