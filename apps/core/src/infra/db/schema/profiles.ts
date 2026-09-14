import { integer, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { players } from './players.js';
import { worlds } from './worlds.js';

/** Profile ze słownika: obecność gracza na jednym świecie. NULL w home_* = profil bez osad. */
export const profiles = pgTable(
  'profiles',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    homeX: integer('home_x'),
    homeY: integer('home_y'),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'profiles_pk', columns: [t.worldId, t.playerId] }),
  ],
);
