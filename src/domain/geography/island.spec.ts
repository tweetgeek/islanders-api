import {
  biomeFromValue,
  biomeValue,
  depositFor,
  islandAt,
  landValue,
} from './island.js';
import { hashCell } from './hash.js';

describe('złote wiersze z api-guidelines 4.6 (land, biome)', () => {
  it.each([
    [1337, 0, 0, 0.52106858532360678, -0.88707904466873189],
    [1337, 103, 100, -0.26560642750074925, -0.31056894613770364],
    [1337, -5, 7, -0.48523097151887001, -0.66758352130138876],
    [42, 1234, -987, 0.203585947407386, -0.32286378155278411],
  ])('seed %i, (%i, %i): land %d, biome %d', (seed, x, y, land, biome) => {
    expect(landValue(seed, x, y)).toBe(land);
    expect(biomeValue(seed, x, y)).toBe(biome);
  });
});

describe('biomeFromValue', () => {
  it('pasma BIOME_BAND = 0.15', () => {
    expect(biomeFromValue(-0.1500001)).toBe('TROPICAL');
    expect(biomeFromValue(-0.15)).toBe('TEMPERATE');
    expect(biomeFromValue(0)).toBe('TEMPERATE');
    expect(biomeFromValue(0.15)).toBe('TEMPERATE');
    expect(biomeFromValue(0.1500001)).toBe('VOLCANIC');
  });
});

describe('islandAt', () => {
  it('(1337, 0, 0) to tropikalna wyspa o promieniu 103.89427400819426 bez znaleziska (z world-parity.json)', () => {
    const island = islandAt(1337, 0, 0);
    expect(island).not.toBeNull();
    expect(island!.hash).toBe(983106472);
    expect(island!.biome).toBe('TROPICAL');
    expect(island!.radius).toBe(103.89427400819426);
    expect(island!.deposit).toEqual({});
  });

  it('(1337, 103, 100) to morze', () => {
    expect(islandAt(1337, 103, 100)).toBeNull();
  });

  it('gęstość lądu na 100x100 dla seeda 1337 mieści się w 15–22 %', () => {
    let land = 0;
    for (let x = 0; x < 100; x++)
      for (let y = 0; y < 100; y++) if (islandAt(1337, x, y)) land++;
    expect(land / 10000).toBeGreaterThan(0.15);
    expect(land / 10000).toBeLessThan(0.22);
  });
});

describe('depositFor', () => {
  it('zawiera wyłącznie zasoby spoza biomu, 1–2 pozycje, ilości całkowite w [200, 999]', () => {
    const foreignOf = {
      TROPICAL: ['stone', 'iron', 'sulfur'],
      TEMPERATE: ['wood', 'iron', 'sulfur'],
      VOLCANIC: ['wood', 'stone', 'food'],
    } as const;
    let nonEmpty = 0;
    for (let i = 0; i < 2000; i++) {
      for (const biome of ['TROPICAL', 'TEMPERATE', 'VOLCANIC'] as const) {
        const deposit = depositFor(biome, hashCell(1, i, 0));
        const keys = Object.keys(deposit);
        expect(keys.length).toBeLessThanOrEqual(2);
        for (const k of keys) {
          expect(foreignOf[biome]).toContain(k);
          const amount = deposit[k as keyof typeof deposit]!;
          expect(Number.isInteger(amount)).toBe(true);
          expect(amount).toBeGreaterThanOrEqual(200);
          expect(amount).toBeLessThanOrEqual(999);
        }
        if (keys.length > 0) nonEmpty++;
      }
    }
    // DEPOSIT_CHANCE = 0.3: około 30 % wysp ma znalezisko
    expect(nonEmpty / 6000).toBeGreaterThan(0.25);
    expect(nonEmpty / 6000).toBeLessThan(0.35);
  });
});
