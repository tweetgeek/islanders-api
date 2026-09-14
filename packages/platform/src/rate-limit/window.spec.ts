import { retryAfterSeconds, windowIndex, windowKey } from './window.js';

describe('okno limitera', () => {
  const at = Date.parse('2026-09-08T12:00:30.000Z');

  it('indeks okna zmienia się dokładnie na granicy minuty', () => {
    const start = Date.parse('2026-09-08T12:00:00.000Z');
    expect(windowIndex(start, 60_000)).toBe(windowIndex(start + 59_999, 60_000));
    expect(windowIndex(start + 60_000, 60_000)).toBe(windowIndex(start, 60_000) + 1);
  });

  it('klucz zawiera prefiks, kubełek, podmiot i indeks okna', () => {
    expect(windowKey('rl', 'login', '1.2.3.4', at, 60_000)).toBe(
      `rl:login:1.2.3.4:${Math.floor(at / 60_000)}`,
    );
  });

  it('Retry-After to sekundy do końca okna, zaokrąglone w górę, co najmniej 1', () => {
    expect(retryAfterSeconds(at, 60_000)).toBe(30);
    expect(retryAfterSeconds(at + 29_500, 60_000)).toBe(1);
    expect(retryAfterSeconds(Date.parse('2026-09-08T12:00:59.999Z'), 60_000)).toBe(1);
  });
});
