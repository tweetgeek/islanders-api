export const BACKOFF_MIN_MS = 2_000;
export const BACKOFF_MAX_MS = 300_000;
const JITTER = 0.2;

/** Opóźnienie przed kolejną próbą: 2 s · 2^(n−1), ±20 %, obcięte do [2 s, 5 min]. */
export function backoffDelayMs(attempts: number, random: () => number): number {
  const n = Math.max(1, attempts);
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (n - 1));
  const factor = 1 - JITTER + random() * 2 * JITTER;
  return Math.round(Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, base * factor)));
}
