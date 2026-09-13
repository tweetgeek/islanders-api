import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { biomeType, buildingType } from './enums.js';
import { settlements } from './settlements.js';

/** 18 dozwolonych par (biom, budynek), wstawianych migracją 0002. */
export const biomeBuildings = pgTable(
  'biome_buildings',
  {
    biome: biomeType('biome').notNull(),
    type: buildingType('type').notNull(),
  },
  (t) => [primaryKey({ columns: [t.biome, t.type] })],
);

export const buildings = pgTable(
  'buildings',
  {
    worldId: integer('world_id').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    biome: biomeType('biome').notNull(),
    type: buildingType('type').notNull(),
    level: integer('level').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.x, t.y, t.type] }),
    foreignKey({
      name: 'buildings_settlement_biome_fk',
      columns: [t.worldId, t.x, t.y, t.biome],
      foreignColumns: [
        settlements.worldId,
        settlements.x,
        settlements.y,
        settlements.biome,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'buildings_biome_type_fk',
      columns: [t.biome, t.type],
      foreignColumns: [biomeBuildings.biome, biomeBuildings.type],
    }),
    check('buildings_level_nonnegative', sql`${t.level} >= 0`),
  ],
);
