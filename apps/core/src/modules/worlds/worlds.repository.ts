import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { worlds } from '../../infra/db/schema/index.js';

export type WorldRow = typeof worlds.$inferSelect;
export type WorldStatus = WorldRow['status'];

export interface CreateWorldInput {
  seed: number;
  width: number;
  height: number;
  windX: number;
  windY: number;
  status?: WorldStatus;
}

@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(): Promise<WorldRow[]> {
    return this.db.select().from(worlds).orderBy(asc(worlds.id));
  }

  findById(id: number): Promise<WorldRow | undefined> {
    return this.db.query.worlds.findFirst({ where: eq(worlds.id, id) });
  }

  async create(input: CreateWorldInput): Promise<WorldRow> {
    const [row] = await this.db.insert(worlds).values(input).returning();
    return row;
  }
}
