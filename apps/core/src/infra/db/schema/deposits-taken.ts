import { integer, numeric, pgTable, primaryKey } from 'drizzle-orm/pg-core';

const taken = (name: string) =>
  numeric(name, { precision: 14, scale: 4, mode: 'number' })
    .notNull()
    .default(0);

/** Ile zabrano ze znaleziska wyliczonego z seeda. Znika w etapie 3 (znaleziska w bazie). */
export const depositsTaken = pgTable(
  'deposits_taken',
  {
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    wood: taken('wood'),
    stone: taken('stone'),
    food: taken('food'),
    iron: taken('iron'),
    sulfur: taken('sulfur'),
  },
  (t) => [primaryKey({ name: 'deposits_taken_pk', columns: [t.x, t.y] })],
);
