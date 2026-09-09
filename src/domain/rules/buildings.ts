import type { Biome } from './biomes.js';
import type { Resource } from './resources.js';

export const COMMON_BUILDINGS = [
  'TOWN_HALL',
  'BARRACKS',
  'SHIPYARD',
  'WAREHOUSE',
] as const;
export const EXTRACTION_BUILDINGS = [
  'SAWMILL',
  'QUARRY',
  'FARM',
  'IRON_MINE',
  'SULFUR_PIT',
] as const;
export const BUILDINGS = [
  ...COMMON_BUILDINGS,
  ...EXTRACTION_BUILDINGS,
] as const;

export type CommonBuilding = (typeof COMMON_BUILDINGS)[number];
export type ExtractionBuilding = (typeof EXTRACTION_BUILDINGS)[number];
export type Building = (typeof BUILDINGS)[number];
/** Poziomy budynków osady; brak klucza = poziom 0. */
export type BuildingLevels = Partial<Record<Building, number>>;

const EXTRACTS: Record<ExtractionBuilding, Resource> = {
  SAWMILL: 'wood',
  QUARRY: 'stone',
  FARM: 'food',
  IRON_MINE: 'iron',
  SULFUR_PIT: 'sulfur',
};

const BIOME_EXTRACTION: Record<
  Biome,
  readonly [ExtractionBuilding, ExtractionBuilding]
> = {
  TROPICAL: ['SAWMILL', 'FARM'],
  TEMPERATE: ['QUARRY', 'FARM'],
  VOLCANIC: ['IRON_MINE', 'SULFUR_PIT'],
};

export function isExtractionBuilding(t: Building): t is ExtractionBuilding {
  return t in EXTRACTS;
}

export function buildingExtracts(t: Building): Resource | null {
  return isExtractionBuilding(t) ? EXTRACTS[t] : null;
}

export function extractionBuildings(
  biome: Biome,
): readonly [ExtractionBuilding, ExtractionBuilding] {
  return BIOME_EXTRACTION[biome];
}

/** Sześć slotów osady: cztery wspólne plus dwa wydobywcze biomu, w stałej kolejności. */
export function slotsFor(biome: Biome): Building[] {
  return [...COMMON_BUILDINGS, ...BIOME_EXTRACTION[biome]];
}
