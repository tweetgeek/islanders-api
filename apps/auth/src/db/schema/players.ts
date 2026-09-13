import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from '@islanders/platform/citext';

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    nickname: citext('nickname').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    roles: text('roles').array().notNull().default(sql`'{player}'::text[]`),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'players_roles_valid',
      sql`${t.roles} <@ ARRAY['player','tester','admin']::text[] AND 'player' = ANY(${t.roles})`,
    ),
  ],
);
