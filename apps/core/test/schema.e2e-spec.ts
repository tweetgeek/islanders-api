import { randomUUID } from 'node:crypto';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import {
  biomeBuildings,
  buildings,
  profiles,
  settlements,
  worldSettings,
} from '../src/infra/db/schema/index.js';
import * as schema from '../src/infra/db/schema/index.js';
import { createTestDatabase } from './support/test-db.js';

describe('schemat bazy core (e2e)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  beforeAll(async () => {
    client = postgres(await createTestDatabase(), { max: 2 });
    db = drizzle(client, { schema });
  });
  afterAll(async () => {
    await client.end();
  });

  const world = { slug: 'world-schema', name: 'Schemat', seed: 1337, width: 200, height: 200 };
  const player = async (nickname = `n${randomUUID().slice(0, 8)}`) => {
    const [row] = await db.insert(profiles).values({ playerId: randomUUID(), nickname }).returning();
    return row;
  };

  it('biome_buildings ma 18 wierszy wstawionych migracją', async () => {
    const rows = await db.select().from(biomeBuildings);
    expect(rows).toHaveLength(18);
    expect(rows.filter((r) => r.biome === 'VOLCANIC').map((r) => r.type).sort()).toEqual([
      'BARRACKS', 'IRON_MINE', 'SHIPYARD', 'SULFUR_PIT', 'TOWN_HALL', 'WAREHOUSE',
    ]);
  });

  it('world_settings: jeden wiersz, domyślnie DRAFT, seed w 31 bitach', async () => {
    const [row] = await db.insert(worldSettings).values(world).returning();
    expect(row).toMatchObject({ id: 1, status: 'DRAFT', isTest: false });
    await expect(db.insert(worldSettings).values({ ...world, id: 2 })).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'world_settings_singleton' },
    });
    await expect(db.insert(worldSettings).values({ ...world })).rejects.toMatchObject({
      cause: { code: '23505' },
    });
    await expect(db.update(worldSettings).set({ seed: -1 })).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'world_settings_seed_31bit' },
    });
  });

  it('klucze obce odrzucają budynek spoza biomu, kłamstwo o biomie i osadę bez profilu', async () => {
    const owner = await player();
    const base = { x: 5, y: 5 };
    await db.insert(settlements).values({
      ...base, ownerId: owner.playerId, name: 'Wulkan', biome: 'VOLCANIC',
      wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0, lastSyncAt: new Date(),
    });
    await expect(
      db.insert(buildings).values({ ...base, biome: 'VOLCANIC', type: 'SAWMILL', level: 1 }),
    ).rejects.toMatchObject({ cause: { code: '23503', constraint_name: 'buildings_biome_type_fk' } });
    await expect(
      db.insert(buildings).values({ ...base, biome: 'TROPICAL', type: 'SAWMILL', level: 1 }),
    ).rejects.toMatchObject({ cause: { code: '23503', constraint_name: 'buildings_settlement_biome_fk' } });
    await expect(
      db.insert(buildings).values({ ...base, biome: 'VOLCANIC', type: 'IRON_MINE', level: 1 }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(settlements).values({
        x: 6, y: 6, ownerId: randomUUID(), name: 'Sierota', biome: 'TROPICAL',
        wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0, lastSyncAt: new Date(),
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('pseudonim w profilu jest unikalny bez rozróżniania wielkości liter (citext)', async () => {
    const nick = `Citext${Date.now()}`;
    await player(nick);
    // Inna wielkość liter celowo — dowód, że kolumna ma typ citext, a nie text.
    await expect(player(nick.toUpperCase())).rejects.toMatchObject({
      cause: { code: '23505', constraint_name: 'profiles_nickname_unique' },
    });
  });
});
