import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { players } from '../../infra/db/schema/index.js';

export type PlayerRow = typeof players.$inferSelect;

@Injectable()
export class PlayersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Rzuca błąd Postgresa 23505 (players_email_unique / players_nickname_unique) przy duplikacie. */
  async create(input: {
    email: string;
    nickname: string;
    passwordHash: string;
  }): Promise<PlayerRow> {
    const [row] = await this.db.insert(players).values(input).returning();
    return row;
  }

  findByEmail(email: string): Promise<PlayerRow | undefined> {
    return this.db.query.players.findFirst({ where: eq(players.email, email) });
  }

  findById(id: number): Promise<PlayerRow | undefined> {
    return this.db.query.players.findFirst({ where: eq(players.id, id) });
  }
}
