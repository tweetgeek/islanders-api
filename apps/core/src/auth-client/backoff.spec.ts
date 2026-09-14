import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, backoffDelayMs } from './backoff.js';

describe('backoff wykładniczy z jitterem', () => {
  const mid = () => 0.5; // jitter zerowy

  it('rośnie dwukrotnie od 2 s i zatrzymuje się na 5 min', () => {
    expect(backoffDelayMs(1, mid)).toBe(2_000);
    expect(backoffDelayMs(2, mid)).toBe(4_000);
    expect(backoffDelayMs(3, mid)).toBe(8_000);
    expect(backoffDelayMs(50, mid)).toBe(BACKOFF_MAX_MS);
  });

  it('jitter mieści się w ±20 % i nie wychodzi poza granice', () => {
    expect(backoffDelayMs(3, () => 0)).toBe(6_400);
    expect(backoffDelayMs(3, () => 0.999999)).toBeLessThanOrEqual(9_600);
    expect(backoffDelayMs(1, () => 0)).toBe(BACKOFF_MIN_MS);
    expect(backoffDelayMs(50, () => 0.999999)).toBe(BACKOFF_MAX_MS);
  });

  it('attempts < 1 traktowane jak pierwsza próba', () => {
    expect(backoffDelayMs(0, mid)).toBe(2_000);
  });
});
