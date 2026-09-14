import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT, RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimitDecision, RateLimiter } from './rate-limiter.js';

const env = { RATE_LIMIT_AUTH_PER_MINUTE: 10, RATE_LIMIT_SUBJECT_PER_MINUTE: 120 };

/** Licznik w pamięci o semantyce RateLimiter.hit — strażnik testujemy bez Redisa. */
class FakeLimiter {
  readonly counts = new Map<string, number>();
  readonly calls: Array<{ bucket: string; subject: string; limit: number }> = [];
  async hit(bucket: string, subject: string, limit: number): Promise<RateLimitDecision> {
    this.calls.push({ bucket, subject, limit });
    const key = `${bucket}:${subject}`;
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n > limit ? { allowed: false, retryAfterSeconds: 42 } : { allowed: true };
  }
}

function context(req: Record<string, unknown>, handler: object, cls: object = class C {}) {
  const headers: Record<string, string> = {};
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
    }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

describe('RateLimitGuard', () => {
  const make = () => {
    const limiter = new FakeLimiter();
    const guard = new RateLimitGuard(new Reflector(), limiter as unknown as RateLimiter, env);
    return { limiter, guard };
  };

  it('trasa bez metadanych i bez podmiotu: bez limitu, bez wywołania limitera', async () => {
    const { guard, limiter } = make();
    const { ctx } = context({ ip: '1.1.1.1' }, function open() {});
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(limiter.calls).toHaveLength(0);
  });

  it('trasa z podmiotem: kubełek po podmiocie z limitem RATE_LIMIT_SUBJECT_PER_MINUTE', async () => {
    const { guard, limiter } = make();
    const handler = function state() {};
    for (let i = 0; i < 120; i++) {
      expect(await guard.canActivate(context({ rateLimitSubject: 'a', ip: '1.1.1.1' }, handler).ctx)).toBe(true);
    }
    const { ctx, headers } = context({ rateLimitSubject: 'a', ip: '1.1.1.1' }, handler);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(headers['Retry-After']).toBe('42');
    expect(await guard.canActivate(context({ rateLimitSubject: 'b', ip: '1.1.1.1' }, handler).ctx)).toBe(true);
    expect(limiter.calls[0]).toEqual({ bucket: 'subject', subject: 'a', limit: 120 });
  });

  it('@RateLimit("ip"): kubełek po trasie i adresie z limitem RATE_LIMIT_AUTH_PER_MINUTE', async () => {
    const { guard, limiter } = make();
    const login = function login() {};
    Reflect.defineMetadata(RATE_LIMIT, 'ip', login);
    for (let i = 0; i < 10; i++) {
      await guard.canActivate(context({ ip: '2.2.2.2' }, login).ctx);
    }
    let status = 0;
    try {
      await guard.canActivate(context({ ip: '2.2.2.2' }, login).ctx);
    } catch (e) {
      status = (e as HttpException).getStatus();
    }
    expect(status).toBe(429);
    expect(limiter.calls[0]).toEqual({ bucket: 'ip:C.login', subject: '2.2.2.2', limit: 10 });
  });
});
