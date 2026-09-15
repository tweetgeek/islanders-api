import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { profiles } from '../../infra/db/schema/index.js';

export type ProfileRow = typeof profiles.$inferSelect;

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(playerId: string, client: DbClient = this.db): Promise<ProfileRow | undefined> {
    const [row] = await client.select().from(profiles).where(eq(profiles.playerId, playerId));
    return row;
  }

  /** Rzuca 23505 na `profiles_pkey` (profil istnieje) albo `profiles_nickname_unique`. */
  async create(
    client: DbClient,
    input: { playerId: string; nickname: string; homeX: number | null; homeY: number | null },
  ): Promise<ProfileRow> {
    const [row] = await client.insert(profiles).values(input).returning();
    return row;
  }

  async count(client: DbClient = this.db): Promise<number> {
    const [row] = await client.select({ value: count() }).from(profiles);
    return Number(row.value);
  }
}
