import { Inject, Injectable } from '@nestjs/common';
import { and, between, eq, type SQL } from 'drizzle-orm';
import type { Biome, Building, BuildingLevels, Resources } from '@islanders/domain/rules';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { buildings, profiles, settlements } from '../../infra/db/schema/index.js';
import { type Bbox, coordKey } from './bbox.js';
import type { SettlementRecord } from './settlement-views.js';

export interface InsertSettlementInput {
  x: number;
  y: number;
  ownerId: string;
  name: string;
  biome: Biome;
  resources: Resources;
  lastSyncAt: Date;
  buildings: Record<Building, number>;
}

type SettlementBase = Omit<SettlementRecord, 'buildings'>;

@Injectable()
export class SettlementsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  listOwn(ownerId: string): Promise<SettlementRecord[]> {
    return this.load(eq(settlements.ownerId, ownerId));
  }

  listInBbox(bbox: Bbox): Promise<SettlementRecord[]> {
    return this.load(
      and(between(settlements.x, bbox.x1, bbox.x2), between(settlements.y, bbox.y1, bbox.y2))!,
    );
  }

  async findOne(x: number, y: number): Promise<SettlementRecord | undefined> {
    const [row] = await this.load(and(eq(settlements.x, x), eq(settlements.y, y))!);
    return row;
  }

  /** Klucze "x:y" wszystkich osad świata — do sprawdzania, czy wyspa jest zajęta. */
  async listCoords(): Promise<Set<string>> {
    const rows = await this.db.select({ x: settlements.x, y: settlements.y }).from(settlements);
    return new Set(rows.map((r) => coordKey(r.x, r.y)));
  }

  /** Osada i jej sześć slotów w transakcji wywołującego. Rzuca 23505 na `settlements_pk`, gdy wyspa zajęta. */
  async insertWithBuildings(client: DbClient, input: InsertSettlementInput): Promise<void> {
    await client.insert(settlements).values({
      x: input.x,
      y: input.y,
      ownerId: input.ownerId,
      name: input.name,
      biome: input.biome,
      ...input.resources,
      population: 0,
      lastSyncAt: input.lastSyncAt,
    });
    await client.insert(buildings).values(
      (Object.entries(input.buildings) as [Building, number][]).map(([type, level]) => ({
        x: input.x,
        y: input.y,
        biome: input.biome,
        type,
        level,
      })),
    );
  }

  private async load(where: SQL): Promise<SettlementRecord[]> {
    const rows = await this.db
      .select({
        x: settlements.x,
        y: settlements.y,
        ownerId: settlements.ownerId,
        ownerName: profiles.nickname,
        name: settlements.name,
        biome: settlements.biome,
        wood: settlements.wood,
        stone: settlements.stone,
        food: settlements.food,
        iron: settlements.iron,
        sulfur: settlements.sulfur,
        population: settlements.population,
        lastSyncAt: settlements.lastSyncAt,
      })
      .from(settlements)
      .innerJoin(profiles, eq(profiles.playerId, settlements.ownerId))
      .where(where);
    if (rows.length === 0) return [];

    const bases: SettlementBase[] = rows.map((r) => ({
      x: r.x,
      y: r.y,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      name: r.name,
      biome: r.biome,
      resources: { wood: r.wood, stone: r.stone, food: r.food, iron: r.iron, sulfur: r.sulfur },
      population: r.population,
      lastSyncAt: r.lastSyncAt,
    }));

    // Złączenie z tym samym warunkiem co osady: `inArray` po x i po y osobno dałoby iloczyn
    // kartezjański i wciągnęło budynki cudzych osad o współrzędnych mieszanych z dwóch wierszy.
    const levels = await this.db
      .select({ x: buildings.x, y: buildings.y, type: buildings.type, level: buildings.level })
      .from(buildings)
      .innerJoin(settlements, and(eq(settlements.x, buildings.x), eq(settlements.y, buildings.y)))
      .where(where);
    const byCoord = new Map<string, BuildingLevels>();
    for (const l of levels) {
      const key = coordKey(l.x, l.y);
      const entry = byCoord.get(key) ?? {};
      entry[l.type] = l.level;
      byCoord.set(key, entry);
    }
    return bases.map((b) => ({ ...b, buildings: byCoord.get(coordKey(b.x, b.y)) ?? {} }));
  }
}
