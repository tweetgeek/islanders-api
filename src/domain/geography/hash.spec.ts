import { hash01, hashCell } from './hash.js';

describe('hashCell', () => {
  it.each([
    [1337, 0, 0, 983106472],
    [1337, 103, 100, 252586155],
    [1337, -5, 7, 575219644],
    [42, 1234, -987, 1703142128],
  ])(
    'hashCell(%i, %i, %i) = %i (złote wiersze z api-guidelines 4.6)',
    (seed, x, y, expected) => {
      expect(hashCell(seed, x, y)).toBe(expected);
    },
  );

  it('nie jest podatny na 32-bitową arytmetykę number (błędny wynik to 252586152)', () => {
    expect(hashCell(1337, 103, 100)).not.toBe(252586152);
  });

  it('akceptuje seed powyżej 31 bitów, maskując go jak GDScript', () => {
    // seed + i * 1013 w fbm może przekroczyć 31 bitów; wynik musi być identyczny z zamaskowanym wejściem
    expect(hashCell(2 ** 31 + 5, 3, 4)).toBe(hashCell(5, 3, 4));
  });

  it('wynik zawsze w [0, 2^31 - 1]', () => {
    for (const [s, x, y] of [
      [0, 0, 0],
      [2147483647, 199, 199],
      [1, -1000, -1000],
    ]) {
      const h = hashCell(s, x, y);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(2147483647);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe('hash01', () => {
  it('(h % 10007) / 10007', () => {
    expect(hash01(0)).toBe(0);
    expect(hash01(10006)).toBe(10006 / 10007);
    expect(hash01(10007)).toBe(0);
    expect(hash01(983106472)).toBe((983106472 % 10007) / 10007);
  });
});
