import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Role } from '@islanders/contracts';
import { DB, type AuthDb, type AuthDbClient } from '../db/db.js';
import { players } from '../db/schema/index.js';

export type PlayerRow = typeof players.$inferSelect & { roles: Role[] };

@Injectable()
export class PlayersRepository {
  constructor(@Inject(DB) private readonly db: AuthDb) {}

  /** Rzuca 23505 (players_email_unique / players_nickname_unique) przy duplikacie. */
  async create(input: { email: string; nickname: string; passwordHash: string }): Promise<PlayerRow> {
    const [row] = await this.db.insert(players).values(input).returning();
    return row as PlayerRow;
  }

  async findByEmail(email: string): Promise<PlayerRow | undefined> {
    return (await this.db.query.players.findFirst({ where: eq(players.email, email) })) as
      | PlayerRow
      | undefined;
  }

  async findById(id: string, client: AuthDbClient = this.db): Promise<PlayerRow | undefined> {
    const [row] = await client.select().from(players).where(eq(players.id, id));
    return row as PlayerRow | undefined;
  }

  async setRoles(id: string, roles: Role[]): Promise<void> {
    await this.db.update(players).set({ roles }).where(eq(players.id, id));
  }

  async setPasswordHash(client: AuthDbClient, id: string, passwordHash: string): Promise<void> {
    await client.update(players).set({ passwordHash }).where(eq(players.id, id));
  }

  async setDisabledAt(client: AuthDbClient, id: string, at: Date | null): Promise<void> {
    await client.update(players).set({ disabledAt: at }).where(eq(players.id, id));
  }
}
