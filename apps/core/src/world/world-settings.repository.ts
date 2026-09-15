import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../infra/db/db.module.js';
import { worldSettings } from '../infra/db/schema/index.js';
import type { WorldStatus } from './world-status.js';

export type WorldSettingsRow = typeof worldSettings.$inferSelect;

export interface InitWorldInput {
  slug: string;
  name: string;
  seed: number;
  width: number;
  height: number;
  windX: number;
  windY: number;
  isTest: boolean;
  status?: WorldStatus;
}

export class WorldNotInitializedError extends Error {
  constructor() {
    super('Baza nie ma świata — uruchom world:init');
    this.name = 'WorldNotInitializedError';
  }
}

@Injectable()
export class WorldSettingsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(client: DbClient = this.db): Promise<WorldSettingsRow | undefined> {
    const [row] = await client.select().from(worldSettings).where(eq(worldSettings.id, 1));
    return row;
  }

  async get(): Promise<WorldSettingsRow> {
    const row = await this.find();
    if (!row) throw new WorldNotInitializedError();
    return row;
  }

  async findForUpdate(client: DbClient): Promise<WorldSettingsRow | undefined> {
    const [row] = await client
      .select()
      .from(worldSettings)
      .where(eq(worldSettings.id, 1))
      .for('update');
    return row;
  }

  /** Blokada współdzielona: nie blokuje innych czytelników, ale serializuje się z `findForUpdate`. */
  async findForShare(client: DbClient): Promise<WorldSettingsRow | undefined> {
    const [row] = await client
      .select()
      .from(worldSettings)
      .where(eq(worldSettings.id, 1))
      .for('share');
    return row;
  }

  async insert(client: DbClient, input: InitWorldInput): Promise<WorldSettingsRow> {
    const [row] = await client.insert(worldSettings).values({ id: 1, ...input }).returning();
    return row;
  }

  async setStatus(client: DbClient, status: WorldStatus, now: Date): Promise<void> {
    await client.update(worldSettings).set({ status, updatedAt: now }).where(eq(worldSettings.id, 1));
  }
}
