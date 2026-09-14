import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from '@islanders/platform/citext';

/** Profile ze słownika: obecność gracza na tym świecie. Pseudonim skopiowany z tokenu przy dołączeniu. */
export const profiles = pgTable('profiles', {
  playerId: uuid('player_id').primaryKey(),
  nickname: citext('nickname').notNull().unique(),
  // NULL w home_* = profil bez osad (przenoszenie po stracie należy do floty).
  homeX: integer('home_x'),
  homeY: integer('home_y'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});
