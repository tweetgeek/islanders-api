import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { WorldListItem, WorldRegistration, WorldStatus } from '@islanders/contracts';
import { DB, type AuthDb, type AuthDbClient } from '../db/db.js';
import { profiles, worlds } from '../db/schema/index.js';

export type WorldRow = typeof worlds.$inferSelect;

@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: AuthDb) {}

  /** Zgłoszenie świata nie zmienia `reachable` — to pole należy do sondy. */
  async upsert(slug: string, r: WorldRegistration, now: Date): Promise<void> {
    await this.db
      .insert(worlds)
      .values({ slug, ...r, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: worlds.slug,
        set: {
          name: r.name,
          publicUrl: r.publicUrl,
          adminUrl: r.adminUrl,
          status: r.status,
          isTest: r.isTest,
          updatedAt: now,
        },
      });
  }

  async find(slug: string, client: AuthDbClient = this.db): Promise<WorldRow | undefined> {
    const [row] = await client.select().from(worlds).where(eq(worlds.slug, slug));
    return row;
  }

  listAll(): Promise<WorldRow[]> {
    return this.db.select().from(worlds).orderBy(asc(worlds.slug));
  }

  async listVisible(playerId: string, includeTest: boolean): Promise<WorldListItem[]> {
    const rows = await this.db
      .select({
        slug: worlds.slug,
        name: worlds.name,
        publicUrl: worlds.publicUrl,
        status: worlds.status,
        isTest: worlds.isTest,
        reachable: worlds.reachable,
        joined: sql<boolean>`${profiles.playerId} IS NOT NULL`,
      })
      .from(worlds)
      .leftJoin(
        profiles,
        and(
          eq(profiles.worldSlug, worlds.slug),
          eq(profiles.playerId, playerId),
        ),
      )
      .where(and(ne(worlds.status, 'DRAFT'), includeTest ? undefined : eq(worlds.isTest, false)))
      .orderBy(asc(worlds.slug));
    return rows as WorldListItem[];
  }

  async setStatus(client: AuthDbClient, slug: string, status: WorldStatus, now: Date): Promise<void> {
    await client.update(worlds).set({ status, updatedAt: now }).where(eq(worlds.slug, slug));
  }

  async setReachable(slug: string, reachable: boolean, now: Date): Promise<void> {
    await this.db.update(worlds).set({ reachable, lastProbeAt: now }).where(eq(worlds.slug, slug));
  }
}
