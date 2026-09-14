import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { players } from './players.js';
import { worlds } from './worlds.js';

/** Odbicie profili ze światów: gracz ma profil na świecie. Profil nie kończy się w MVP. */
export const profiles = pgTable(
  'profiles',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    worldSlug: text('world_slug')
      .notNull()
      .references(() => worlds.slug, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.worldSlug] })],
);
