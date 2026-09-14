import { fbm, smooth, valueNoise } from './noise.js';

describe('smooth', () => {
  it('t*t*(3-2t)', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(0.25)).toBe(0.25 * 0.25 * (3 - 2 * 0.25));
  });
});

describe('valueNoise', () => {
  it('w punktach całkowitych zwraca wartość siatki w [-1, 1)', () => {
    const v = valueNoise(1337, 3, 4);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThan(1);
    expect(valueNoise(1337, 3.0, 4.0)).toBe(v);
  });

  it('używa podłogi matematycznej dla ujemnych współrzędnych', () => {
    // floor(-0.5) = -1, trunc(-0.5) = 0 — gdyby użyto trunc, wynik byłby inny niż dla komórki -1
    const withFloor = valueNoise(7, -0.5, 0);
    expect(Number.isFinite(withFloor)).toBe(true);
    expect(withFloor).not.toBe(valueNoise(7, 0.5, 0));
  });
});

describe('fbm', () => {
  it('jedna oktawa równa się valueNoise', () => {
    expect(fbm(1337, 1.2, 3.4, 1)).toBe(valueNoise(1337, 1.2, 3.4));
  });

  it('dwie oktawy: (n0 + 0.5 * n1(seed + 1013, 2x, 2y)) / 1.5 w tej kolejności działań', () => {
    const x = 0.36;
    const y = 12.0;
    let total = 0.0;
    let norm = 0.0;
    let amp = 1.0;
    let freq = 1.0;
    for (let i = 0; i < 2; i++) {
      total += amp * valueNoise(1337 + i * 1013, x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    expect(fbm(1337, x, y, 2)).toBe(total / norm);
  });
});
