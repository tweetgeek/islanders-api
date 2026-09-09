import type { Resource } from './resources.js';

export const BIOMES = ['TROPICAL', 'TEMPERATE', 'VOLCANIC'] as const;
export type Biome = (typeof BIOMES)[number];

/** ADR 0002: każdy biom produkuje dokładnie dwa zasoby. */
const BIOME_RESOURCES: Record<Biome, readonly [Resource, Resource]> = {
  TROPICAL: ['wood', 'food'],
  TEMPERATE: ['stone', 'food'],
  VOLCANIC: ['iron', 'sulfur'],
};

export function biomeResources(biome: Biome): readonly [Resource, Resource] {
  return BIOME_RESOURCES[biome];
}
