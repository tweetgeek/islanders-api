import {
  BASE_RATE,
  STARTER_PACK,
  capacityFor,
  populationMaxFor,
  productionPerHour,
  startingBuildings,
} from './balance.js';

describe('balans — wartości robocze (spec A 6.2)', () => {
  it('stan startowy: ratusz 1, magazyn 1, wydobywcze 1, koszary i stocznia 0, dokładnie sześć slotów', () => {
    expect(startingBuildings('TROPICAL')).toEqual({
      TOWN_HALL: 1,
      BARRACKS: 0,
      SHIPYARD: 0,
      WAREHOUSE: 1,
      SAWMILL: 1,
      FARM: 1,
    });
    expect(Object.keys(startingBuildings('VOLCANIC'))).toHaveLength(6);
  });

  it('pakiet startowy', () => {
    expect(STARTER_PACK).toEqual({
      wood: 500,
      stone: 200,
      food: 1000,
      iron: 40,
      sulfur: 0,
    });
  });

  it('produkcja = BASE_RATE * poziom, zasób spoza biomu zawsze 0', () => {
    expect(productionPerHour('TROPICAL', { SAWMILL: 2, FARM: 1 })).toEqual({
      wood: 2 * BASE_RATE.SAWMILL,
      stone: 0,
      food: BASE_RATE.FARM,
      iron: 0,
      sulfur: 0,
    });
    // poziom budynku spoza biomu (nie powinien istnieć) nie daje produkcji
    expect(
      productionPerHour('VOLCANIC', { SAWMILL: 3, IRON_MINE: 1 }).wood,
    ).toBe(0);
    expect(
      productionPerHour('VOLCANIC', { SAWMILL: 3, IRON_MINE: 1 }).iron,
    ).toBe(BASE_RATE.IRON_MINE);
    expect(productionPerHour('TEMPERATE', {})).toEqual({
      wood: 0,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
    });
  });

  it('pojemność 500 + 1500 * WAREHOUSE', () => {
    expect(capacityFor({})).toBe(500);
    expect(capacityFor({ WAREHOUSE: 1 })).toBe(2000);
    expect(capacityFor({ WAREHOUSE: 3 })).toBe(5000);
  });

  it('limit populacji 100 * TOWN_HALL', () => {
    expect(populationMaxFor({})).toBe(0);
    expect(populationMaxFor({ TOWN_HALL: 1 })).toBe(100);
    expect(populationMaxFor({ TOWN_HALL: 2 })).toBe(200);
  });
});
