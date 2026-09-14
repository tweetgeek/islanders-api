import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { profiles } from '../../infra/db/schema/index.js';

export type ProfileRow = typeof profiles.$inferSelect;

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  find(worldId: number, playerId: number): Promise<ProfileRow | undefined> {
    return this.db.query.profiles.findFirst({
      where: and(
        eq(profiles.worldId, worldId),
        eq(profiles.playerId, playerId),
      ),
    });
  }

  /** Przyjmuje bazę albo transakcję, bo `join` wstawia profil razem z osadą. */
  async create(
    client: DbClient,
    input: {
      worldId: number;
      playerId: number;
      homeX: number | null;
      homeY: number | null;
    },
  ): Promise<ProfileRow> {
    const [row] = await client.insert(profiles).values(input).returning();
    return row;
  }

  async worldIdsFor(playerId: number): Promise<Set<number>> {
    const rows = await this.db
      .select({ worldId: profiles.worldId })
      .from(profiles)
      .where(eq(profiles.playerId, playerId));
    return new Set(rows.map((r) => r.worldId));
  }
}
