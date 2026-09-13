import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BIOME_BAND,
  BIOME_FREQUENCY,
  DEPOSIT_CHANCE,
  LAND_FREQUENCY,
  LAND_THRESHOLD,
  RADIUS_MAX,
  RADIUS_MIN,
  RESOURCE_ORDER,
} from './constants.js';
import { hashCell } from './hash.js';
import { biomeValue, islandAt, landValue, type Deposit } from './island.js';

interface ParityCell {
  x: number;
  y: number;
  hash: number;
  land: number;
  biome: number;
  isIsland: boolean;
  biomeType?: string;
  radius?: number;
  deposit?: Deposit;
}

interface ParityFile {
  gridSize: number;
  constants: {
    landFrequency: number;
    biomeFrequency: number;
    biomeBand: number;
    landThreshold: number;
    radiusMin: number;
    radiusMax: number;
    depositChance: number;
    resourceOrder: string[];
  };
  worlds: { seed: number; cells: ParityCell[] }[];
}

const clientDir = process.env.ISLANDERS_CLIENT_DIR ?? '../../../islanders';
const parityPath = path.resolve(
  process.cwd(),
  clientDir,
  'contract',
  'world-parity.json',
);

function loadParity(): ParityFile {
  if (!existsSync(parityPath)) {
    throw new Error(
      `Brak pliku kontraktu ${parityPath}. Sklonuj repozytorium klienta obok backendu albo ustaw ISLANDERS_CLIENT_DIR. Ten test nie może być pomijany.`,
    );
  }
  return JSON.parse(readFileSync(parityPath, 'utf8')) as ParityFile;
}

describe('zgodność geografii z klientem (contract/world-parity.json)', () => {
  const parity = loadParity();

  it('stałe kontraktu są identyczne', () => {
    expect(parity.constants.landFrequency).toBe(LAND_FREQUENCY);
    expect(parity.constants.biomeFrequency).toBe(BIOME_FREQUENCY);
    expect(parity.constants.biomeBand).toBe(BIOME_BAND);
    expect(parity.constants.landThreshold).toBe(LAND_THRESHOLD);
    expect(parity.constants.radiusMin).toBe(RADIUS_MIN);
    expect(parity.constants.radiusMax).toBe(RADIUS_MAX);
    expect(parity.constants.depositChance).toBe(DEPOSIT_CHANCE);
    expect(parity.constants.resourceOrder).toEqual([...RESOURCE_ORDER]);
  });

  it('plik pokrywa co najmniej 2 światy po gridSize² komórek', () => {
    expect(parity.gridSize).toBeGreaterThan(0);
    expect(parity.worlds.length).toBeGreaterThanOrEqual(2);
    for (const w of parity.worlds) {
      expect(w.cells).toHaveLength(parity.gridSize * parity.gridSize);
      expect(w.cells.length).toBeGreaterThan(0);
    }
  });

  for (const world of parity.worlds) {
    it(`seed ${world.seed}: każda komórka zgadza się dokładnie (bez tolerancji)`, () => {
      const mismatches: string[] = [];
      for (const cell of world.cells) {
        const { x, y } = cell;
        const hash = hashCell(world.seed, x, y);
        const land = landValue(world.seed, x, y);
        const biome = biomeValue(world.seed, x, y);
        const island = islandAt(world.seed, x, y);

        if (hash !== cell.hash)
          mismatches.push(`(${x},${y}) hash ${hash} != ${cell.hash}`);
        if (land !== cell.land)
          mismatches.push(`(${x},${y}) land ${land} != ${cell.land}`);
        if (biome !== cell.biome)
          mismatches.push(`(${x},${y}) biome ${biome} != ${cell.biome}`);
        if ((island !== null) !== cell.isIsland) {
          mismatches.push(
            `(${x},${y}) isIsland ${island !== null} != ${cell.isIsland}`,
          );
          continue;
        }
        if (island) {
          if (island.biome !== cell.biomeType)
            mismatches.push(
              `(${x},${y}) biomeType ${island.biome} != ${cell.biomeType}`,
            );
          if (island.radius !== cell.radius)
            mismatches.push(
              `(${x},${y}) radius ${island.radius} != ${cell.radius}`,
            );
          const expectedDeposit = cell.deposit ?? {};
          const keys = new Set([
            ...Object.keys(island.deposit),
            ...Object.keys(expectedDeposit),
          ]);
          for (const k of keys) {
            const got = island.deposit[k as keyof Deposit];
            const want = expectedDeposit[k as keyof Deposit];
            if (got !== want)
              mismatches.push(`(${x},${y}) deposit.${k} ${got} != ${want}`);
          }
        }
        if (mismatches.length >= 20) break;
      }
      expect(
        mismatches,
        `pierwsze rozbieżności:\n${mismatches.join('\n')}`,
      ).toEqual([]);
    }, 60_000);
  }
});
