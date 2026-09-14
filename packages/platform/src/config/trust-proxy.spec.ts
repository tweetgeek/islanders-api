import { parseTrustProxy } from './env.js';

describe('parseTrustProxy', () => {
  it('false i true jako wartości logiczne', () => {
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
  });
  it('liczba przeskoków jako liczba', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });
  it('lista podsieci jako tekst przekazywany Expressowi', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12')).toBe('10.0.0.0/8,172.16.0.0/12');
  });
});
