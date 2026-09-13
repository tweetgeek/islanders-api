import { islandAt, type Biome } from '../../domain/geography/index.js';

export interface HomeIslandPick {
  x: number;
  y: number;
  biome: Biome;
}

/** Komórki w odległości Czebyszewa dokładnie r od (cx, cy). r = 0 to sam środek. */
export function* ringCells(
  cx: number,
  cy: number,
  r: number,
): Generator<[number, number]> {
  if (r === 0) {
    yield [cx, cy];
    return;
  }
  for (let x = cx - r; x <= cx + r; x++) {
    yield [x, cy - r];
    yield [x, cy + r];
  }
  for (let y = cy - r + 1; y <= cy + r - 1; y++) {
    yield [cx - r, y];
    yield [cx + r, y];
  }
}

/**
 * Losowa wolna wyspa z jedzeniem (TROPICAL lub TEMPERATE) z najbliższego środka pierścienia,
 * w którym taka istnieje. Gracze lądują blisko siebie, a pierścień rośnie, gdy w środku brakuje miejsca.
 * Czysta funkcja: zajętość i losowość przychodzą z zewnątrz.
 */
export function pickHomeIsland(
  world: { seed: number; width: number; height: number },
  isTaken: (x: number, y: number) => boolean,
  randomInt: (maxExclusive: number) => number,
): HomeIslandPick | null {
  const cx = Math.floor(world.width / 2);
  const cy = Math.floor(world.height / 2);
  const maxRing = Math.max(cx, world.width - 1 - cx, cy, world.height - 1 - cy);
  for (let r = 0; r <= maxRing; r++) {
    const candidates: HomeIslandPick[] = [];
    for (const [x, y] of ringCells(cx, cy, r)) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      if (isTaken(x, y)) continue;
      const island = islandAt(world.seed, x, y);
      if (island && island.biome !== 'VOLCANIC') {
        candidates.push({ x, y, biome: island.biome });
      }
    }
    if (candidates.length > 0) {
      return candidates[randomInt(candidates.length)];
    }
  }
  return null;
}
