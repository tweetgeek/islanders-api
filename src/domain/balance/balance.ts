import {
  type Biome,
  type Building,
  type BuildingLevels,
  type ExtractionBuilding,
  type Resources,
  buildingExtracts,
  emptyResources,
  extractionBuildings,
  slotsFor,
} from '../rules/index.js';

/**
 * WARTOŚCI ROBOCZE. Spec B kalibruje je i dopisuje koszty oraz czasy, nie zmieniając sygnatur.
 * Jedyne miejsce w kodzie, gdzie wolno trzymać liczby balansu.
 */

export const STARTER_PACK: Resources = {
  wood: 500,
  stone: 200,
  food: 1000,
  iron: 40,
  sulfur: 0,
};

/** Produkcja na godzinę na poziom budynku wydobywczego. */
export const BASE_RATE: Record<ExtractionBuilding, number> = {
  SAWMILL: 60,
  QUARRY: 50,
  FARM: 80,
  IRON_MINE: 30,
  SULFUR_PIT: 20,
};

const STARTING_LEVELS: Partial<Record<Building, number>> = {
  TOWN_HALL: 1,
  WAREHOUSE: 1,
};

/** Sześć slotów biomu z poziomami startowymi: ratusz 1, magazyn 1, oba wydobywcze 1, reszta 0. */
export function startingBuildings(biome: Biome): Record<Building, number> {
  const extraction = extractionBuildings(biome);
  const out = {} as Record<Building, number>;
  for (const slot of slotsFor(biome)) {
    out[slot] =
      STARTING_LEVELS[slot] ??
      ((extraction as readonly Building[]).includes(slot) ? 1 : 0);
  }
  return out;
}

/** Zasób spoza biomu ma zawsze 0, nawet gdyby w `levels` pojawił się obcy budynek. */
export function productionPerHour(
  biome: Biome,
  levels: BuildingLevels,
): Resources {
  const out = emptyResources();
  for (const building of extractionBuildings(biome)) {
    const resource = buildingExtracts(building);
    if (resource) out[resource] = BASE_RATE[building] * (levels[building] ?? 0);
  }
  return out;
}

export function capacityFor(levels: BuildingLevels): number {
  return 500 + 1500 * (levels.WAREHOUSE ?? 0);
}

export function populationMaxFor(levels: BuildingLevels): number {
  return 100 * (levels.TOWN_HALL ?? 0);
}
