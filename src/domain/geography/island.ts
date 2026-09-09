import {
  BIOME_BAND,
  BIOME_FREQUENCY,
  DEPOSIT_CHANCE,
  LAND_FREQUENCY,
  LAND_THRESHOLD,
  RADIUS_MAX,
  RADIUS_MIN,
  RESOURCE_ORDER,
  type ResourceName,
} from './constants.js';
import { hash01, hashCell } from './hash.js';
import { fbm } from './noise.js';

export type Biome = 'TROPICAL' | 'TEMPERATE' | 'VOLCANIC';
export type Deposit = Partial<Record<ResourceName, number>>;

export interface Island {
  x: number;
  y: number;
  /** hashCell(seed, x, y) — u klienta `Island.seed_val`. */
  hash: number;
  biome: Biome;
  radius: number;
  /** Pusty obiekt = brak znaleziska. */
  deposit: Deposit;
}

/** Zasoby produkowane przez biom — lokalna kopia kontraktu (ADR 0002), sprawdzana testem z domain/rules. */
const BIOME_RESOURCES: Record<Biome, readonly ResourceName[]> = {
  TROPICAL: ['wood', 'food'],
  TEMPERATE: ['stone', 'food'],
  VOLCANIC: ['iron', 'sulfur'],
};

export function landValue(seed: number, x: number, y: number): number {
  return fbm(seed, x * LAND_FREQUENCY, y * LAND_FREQUENCY, 2);
}

export function biomeValue(seed: number, x: number, y: number): number {
  return fbm(seed + 1, x * BIOME_FREQUENCY, y * BIOME_FREQUENCY, 1);
}

export function biomeFromValue(b: number): Biome {
  if (b < -BIOME_BAND) return 'TROPICAL';
  if (b > BIOME_BAND) return 'VOLCANIC';
  return 'TEMPERATE';
}

/** `WorldGrid._deposit_for`: 1–2 zasoby SPOZA biomu wyspy, ilości całkowite w [200, 999]. */
export function depositFor(biome: Biome, h: number): Deposit {
  const h2 = hashCell(h, 7, 11);
  if (hash01(h2) >= DEPOSIT_CHANCE) return {};
  const foreign = RESOURCE_ORDER.filter(
    (r) => !BIOME_RESOURCES[biome].includes(r),
  );
  const h3 = hashCell(h2, 3, 5);
  const count = 1 + Math.trunc(hash01(h3) * 2.0);
  const start = Math.trunc(hash01(hashCell(h3, 1, 1)) * foreign.length);
  const out: Deposit = {};
  for (let i = 0; i < count; i++) {
    const r = foreign[(start + i) % foreign.length];
    const h4 = hashCell(h3, i + 1, 0);
    out[r] = 200 + Math.trunc(hash01(h4) * 800.0);
  }
  return out;
}

/** `WorldGrid.island_at`: null dla morza. */
export function islandAt(seed: number, x: number, y: number): Island | null {
  if (landValue(seed, x, y) <= LAND_THRESHOLD) return null;
  const hash = hashCell(seed, x, y);
  const biome = biomeFromValue(biomeValue(seed, x, y));
  return {
    x,
    y,
    hash,
    biome,
    radius: RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * hash01(hash),
    deposit: depositFor(biome, hash),
  };
}
