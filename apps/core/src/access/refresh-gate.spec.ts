import { RefreshGate } from './refresh-gate.js';

describe('RefreshGate', () => {
  it('przepuszcza pierwsze odświeżenie, potem nie częściej niż raz na 30 s', () => {
    let t = 1_000_000;
    const gate = new RefreshGate(30_000, () => t);
    expect(gate.tryAcquire()).toBe(true);
    t += 29_999;
    expect(gate.tryAcquire()).toBe(false);
    t += 1;
    expect(gate.tryAcquire()).toBe(true);
  });
});
