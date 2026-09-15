export class CircuitOpenError extends Error {
  constructor() {
    super('Usługa kont chwilowo odcięta (circuit breaker otwarty)');
    this.name = 'CircuitOpenError';
  }
}

type State = 'closed' | 'open' | 'half-open';

/** Po `threshold` kolejnych błędach odcina wywołania na `openMs`, potem przepuszcza jedno próbne. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probeInFlight = false;

  constructor(private readonly options: { threshold: number; openMs: number; now: () => number }) {}

  state(): State {
    if (this.openedAt === null) return 'closed';
    return this.options.now() - this.openedAt >= this.options.openMs ? 'half-open' : 'open';
  }

  canRequest(): boolean {
    const state = this.state();
    if (state === 'closed') return true;
    if (state === 'open' || this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    if (this.probeInFlight || this.state() === 'half-open') {
      this.probeInFlight = false;
      this.openedAt = this.options.now();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.options.threshold) {
      this.openedAt = this.options.now();
    }
  }
}
