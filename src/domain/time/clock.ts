/** Jedyne źródło czasu w aplikacji. Produkcja: systemClock; testy: FixedClock. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export class FixedClock implements Clock {
  constructor(private at: Date) {}

  now(): Date {
    return new Date(this.at.getTime());
  }

  set(at: Date): void {
    this.at = new Date(at.getTime());
  }

  advance(ms: number): void {
    this.at = new Date(this.at.getTime() + ms);
  }
}
