import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { citext } from './citext.js';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  email: citext('email').notNull().unique(),
  nickname: citext('nickname').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
