import { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { isForeignKeyViolation } from '../src/infra/db/pg-errors.js';
import {
  biomeBuildings,
  buildings,
  players,
  settlements,
  worlds,
} from '../src/infra/db/schema/index.js';
import { createTestApp } from './support/test-app.js';

describe('schemat bazy (e2e)', () => {
  let app: INestApplication;
  let db: Db;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<Db>(DB);
  });
  afterAll(async () => {
    await app.close();
  });

  it('biome_buildings ma 18 wierszy wstawionych migracją', async () => {
    const rows = await db.select().from(biomeBuildings);
    expect(rows).toHaveLength(18);
    expect(
      rows
        .filter((r) => r.biome === 'VOLCANIC')
        .map((r) => r.type)
        .sort(),
    ).toEqual([
      'BARRACKS',
      'IRON_MINE',
      'SHIPYARD',
      'SULFUR_PIT',
      'TOWN_HALL',
      'WAREHOUSE',
    ]);
  });

  it('klucze obce odrzucają budynek spoza biomu i kłamstwo o biomie osady', async () => {
    const [world] = await db
      .insert(worlds)
      .values({ seed: 1337, width: 200, height: 200 })
      .returning();
    const [player] = await db
      .insert(players)
      .values({
        email: `schema-${Date.now()}@test.local`,
        nickname: `schema${Date.now()}`,
        passwordHash: 'x',
      })
      .returning();
    const base = { worldId: world.id, x: 5, y: 5 };
    await db.insert(settlements).values({
      ...base,
      ownerId: player.id,
      name: 'Wulkan',
      biome: 'VOLCANIC',
      wood: 0,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
      lastSyncAt: new Date(),
    });

    // Drizzle 0.45 opakowuje błąd sterownika, więc kod i nazwa ograniczenia siedzą pod `cause`.
    const outsideBiome = await db
      .insert(buildings)
      .values({ ...base, biome: 'VOLCANIC', type: 'SAWMILL', level: 1 })
      .catch((err: unknown) => err);
    expect(outsideBiome).toMatchObject({
      cause: { code: '23503', constraint_name: 'buildings_biome_type_fk' },
    });
    expect(isForeignKeyViolation(outsideBiome, 'buildings_biome_type_fk')).toBe(
      true,
    );

    const lyingAboutBiome = await db
      .insert(buildings)
      .values({ ...base, biome: 'TROPICAL', type: 'SAWMILL', level: 1 })
      .catch((err: unknown) => err);
    expect(lyingAboutBiome).toMatchObject({
      cause: {
        code: '23503',
        constraint_name: 'buildings_settlement_biome_fk',
      },
    });
    expect(
      isForeignKeyViolation(lyingAboutBiome, 'buildings_settlement_biome_fk'),
    ).toBe(true);

    await expect(
      db
        .insert(buildings)
        .values({ ...base, biome: 'VOLCANIC', type: 'IRON_MINE', level: 1 }),
    ).resolves.toBeDefined();
  });

  it('CHECK odrzuca seed poza 31 bitami', async () => {
    await expect(
      db.insert(worlds).values({ seed: -1, width: 10, height: 10 }),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'worlds_seed_31bit' },
    });
    await expect(
      db.execute(
        sql`INSERT INTO worlds (seed, width, height) VALUES (2147483648, 10, 10)`,
      ),
    ).rejects.toMatchObject({ cause: { code: '22003' } });
  });
});
