import { hash01, hashCell } from './hash.js';
import { OCTAVE_SALT } from './constants.js';

/** Wartość siatki w punkcie całkowitym, w [-1, 1). */
export function lattice(seed: number, ix: number, iy: number): number {
  return hash01(hashCell(seed, ix, iy)) * 2.0 - 1.0;
}

export function smooth(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

/** Dwuwymiarowy szum wartościowy: bilinearna interpolacja rogów wygładzona `smooth`. Math.floor, nigdy trunc. */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = smooth(fx);
  const v = smooth(fy);
  const n00 = lattice(seed, ix, iy);
  const n10 = lattice(seed, ix + 1, iy);
  const n01 = lattice(seed, ix, iy + 1);
  const n11 = lattice(seed, ix + 1, iy + 1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

/** Fraktalna suma oktaw. Kolejność działań jest kontraktem: inna kolejność zmienia ostatnie bity. */
export function fbm(
  seed: number,
  x: number,
  y: number,
  octaves: number,
): number {
  let total = 0.0;
  let norm = 0.0;
  let amp = 1.0;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    total += amp * valueNoise(seed + i * OCTAVE_SALT, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return total / norm;
}
