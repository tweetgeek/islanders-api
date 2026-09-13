import {
  BIOMES,
  BUILDINGS,
  COMMON_BUILDINGS,
  biomeResources,
  buildingExtracts,
  emptyResources,
  extractionBuildings,
  slotsFor,
} from './index.js';

describe('reguły domenowe (CONTEXT.md, ADR 0002)', () => {
  it('każdy biom produkuje dokładnie dwa zasoby i dopuszcza dokładnie dwa budynki wydobywcze', () => {
    for (const b of BIOMES) {
      expect(biomeResources(b)).toHaveLength(2);
      expect(extractionBuildings(b)).toHaveLength(2);
      for (const t of extractionBuildings(b)) {
        expect(biomeResources(b)).toContain(buildingExtracts(t));
      }
    }
  });

  it('mapowanie biomów z ADR 0002', () => {
    expect(biomeResources('TROPICAL')).toEqual(['wood', 'food']);
    expect(biomeResources('TEMPERATE')).toEqual(['stone', 'food']);
    expect(biomeResources('VOLCANIC')).toEqual(['iron', 'sulfur']);
    expect(extractionBuildings('TROPICAL')).toEqual(['SAWMILL', 'FARM']);
    expect(extractionBuildings('TEMPERATE')).toEqual(['QUARRY', 'FARM']);
    expect(extractionBuildings('VOLCANIC')).toEqual([
      'IRON_MINE',
      'SULFUR_PIT',
    ]);
  });

  it('sześć slotów: cztery wspólne plus dwa wydobywcze, w stałej kolejności', () => {
    expect(slotsFor('VOLCANIC')).toEqual([
      ...COMMON_BUILDINGS,
      'IRON_MINE',
      'SULFUR_PIT',
    ]);
    for (const b of BIOMES) expect(slotsFor(b)).toHaveLength(6);
  });

  it('budynki wspólne nic nie wydobywają', () => {
    for (const t of COMMON_BUILDINGS) expect(buildingExtracts(t)).toBeNull();
    expect(BUILDINGS).toHaveLength(9);
  });

  it('emptyResources ma pięć zer', () => {
    expect(emptyResources()).toEqual({
      wood: 0,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
    });
  });
});
