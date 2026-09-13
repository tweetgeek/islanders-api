import { Logger } from '@nestjs/common';
import { FixedClock } from '@islanders/domain/time';
import type { RedisClient } from '../redis/redis.module.js';
import { RateLimiter } from './rate-limiter.js';

type ExecResult = [Error | null, unknown][] | null;

/** Atrapa `redis.multi().incr(...).pexpire(...).exec()` — łańcuch zwraca `this`, `exec` woła podaną funkcję. */
function fakeMultiChain(exec: () => Promise<ExecResult>) {
  const chain = {
    incr: () => chain,
    pexpire: () => chain,
    exec,
  };
  return chain;
}

function fakeRedis(status: string, exec: () => Promise<ExecResult>): {
  redis: RedisClient;
  /** Obiekt, nie liczba — licznik trzeba czytać PO wywołaniu `hit`, więc zwracamy żywą referencję. */
  calls: { multi: number };
} {
  const calls = { multi: 0 };
  const redis = {
    status,
    multi: () => {
      calls.multi++;
      return fakeMultiChain(exec);
    },
  };
  return { redis: redis as unknown as RedisClient, calls };
}

const env = { RATE_LIMIT_PREFIX: 'rl' };

describe('RateLimiter', () => {
  let logged: unknown[][];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = [];
    spy = vi.spyOn(Logger.prototype, 'warn').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('exec() odrzucony: fail-open i ostrzeżenie w logu', async () => {
    const { redis } = fakeRedis('ready', () => Promise.reject(new Error('ECONNRESET')));
    const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));
    const limiter = new RateLimiter(redis, clock, env);

    const decision = await limiter.hit('login', '1.2.3.4', 10);

    expect(decision).toEqual({ allowed: true });
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain('ECONNRESET');
  });

  it('exec() nigdy się nie kończy: po ~200 ms fail-open zamiast wisieć w nieskończoność', async () => {
    // Obietnica świadomie nigdy nierozstrzygnięta — udaje zerwane połączenie, na którym
    // polecenie utknęło w kolejce offline ioredis.
    const { redis } = fakeRedis('ready', () => new Promise<ExecResult>(() => {}));
    const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));
    const limiter = new RateLimiter(redis, clock, env);

    const start = Date.now();
    const decision = await limiter.hit('login', '1.2.3.4', 10);
    const elapsed = Date.now() - start;

    expect(decision).toEqual({ allowed: true });
    // Limit czasu w RateLimiterze to 200 ms; margines na wolniejsze CI.
    expect(elapsed).toBeLessThan(1000);
    expect(logged).toHaveLength(1);
  }, 2000);

  it('status inny niż "ready": fail-open, ostrzeżenie, bez wysyłania polecenia do Redisa', async () => {
    const { redis, calls } = fakeRedis('reconnecting', () =>
      Promise.resolve([[null, 1]] as ExecResult),
    );
    const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));
    const limiter = new RateLimiter(redis, clock, env);

    const decision = await limiter.hit('login', '1.2.3.4', 10);

    expect(decision).toEqual({ allowed: true });
    expect(logged).toHaveLength(1);
    expect(String(logged[0][0])).toContain('reconnecting');
    expect(calls.multi).toBe(0);
  });

  it('ścieżka szczęśliwa: policzone <= limit przepuszcza, > limit odrzuca z Retry-After z zegara', async () => {
    let count = 0;
    const { redis } = fakeRedis('ready', () => {
      count++;
      return Promise.resolve([[null, count]] as ExecResult);
    });
    const clock = new FixedClock(new Date('2026-09-08T12:00:30.000Z'));
    const limiter = new RateLimiter(redis, clock, env);

    for (let i = 0; i < 3; i++) {
      expect(await limiter.hit('login', '1.2.3.4', 3)).toEqual({ allowed: true });
    }
    expect(await limiter.hit('login', '1.2.3.4', 3)).toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });
  });
});
