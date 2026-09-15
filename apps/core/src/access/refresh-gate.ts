/** Ogranicza pobieranie JWKS przy nieznanym `kid`, żeby zalew tokenów z losowym `kid` nie bił w auth. */
export class RefreshGate {
  private last: number | null = null;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number,
  ) {}

  tryAcquire(): boolean {
    const t = this.now();
    if (this.last !== null && t - this.last < this.minIntervalMs) return false;
    this.last = t;
    return true;
  }
}
