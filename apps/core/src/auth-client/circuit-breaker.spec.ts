import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  const make = () => {
    let t = 0;
    const breaker = new CircuitBreaker({ threshold: 5, openMs: 30_000, now: () => t });
    return { breaker, advance: (ms: number) => (t += ms) };
  };

  it('otwiera się po 5 kolejnych błędach, sukces w środku zeruje licznik', () => {
    const { breaker } = make();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    breaker.recordSuccess();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.state()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state()).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('po 30 s przepuszcza jedno żądanie próbne; sukces zamyka, błąd otwiera ponownie', () => {
    const { breaker, advance } = make();
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    advance(29_999);
    expect(breaker.canRequest()).toBe(false);
    advance(1);
    expect(breaker.canRequest()).toBe(true);
    expect(breaker.state()).toBe('half-open');
    expect(breaker.canRequest()).toBe(false);
    breaker.recordFailure();
    expect(breaker.state()).toBe('open');
    advance(30_000);
    expect(breaker.canRequest()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.state()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });
});
