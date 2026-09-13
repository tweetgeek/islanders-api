import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FixedClock } from '@islanders/domain/time';
import type { Env } from '../config/env.js';
import {
  RATE_LIMIT,
  RateLimitGuard,
  type RateLimitKey,
} from './rate-limit.guard.js';

const env = {
  RATE_LIMIT_AUTH_PER_MINUTE: 10,
  RATE_LIMIT_PLAYER_PER_MINUTE: 120,
} as Env;

function context(
  req: Record<string, unknown>,
  handler: object,
  cls: object = class C {},
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  // Każdy test dostaje własny zegar — przesunięcie okna w jednym teście nie może
  // przeciekać do następnych, także wtedy, gdy asercja padnie w połowie.
  const freshClock = () => new FixedClock(new Date('2026-09-08T12:00:00.000Z'));
  const guard = (clock: FixedClock = freshClock()) =>
    new RateLimitGuard(new Reflector(), clock, env);

  it('trasa publiczna bez metadanych: bez limitu', () => {
    const g = guard();
    const handler = function open() {};
    for (let i = 0; i < 500; i++)
      expect(g.canActivate(context({ ip: '1.1.1.1' }, handler))).toBe(true);
  });

  it('trasa z playerId: domyślnie 120/min na gracza, 121. żądanie -> 429, po oknie znów wolno', () => {
    const clock = freshClock();
    const g = guard(clock);
    const handler = function state() {};
    for (let i = 0; i < 120; i++)
      expect(
        g.canActivate(context({ playerId: 7, ip: '1.1.1.1' }, handler)),
      ).toBe(true);
    expect(() =>
      g.canActivate(context({ playerId: 7, ip: '1.1.1.1' }, handler)),
    ).toThrow(HttpException);
    expect(
      g.canActivate(context({ playerId: 8, ip: '1.1.1.1' }, handler)),
    ).toBe(true);
    clock.advance(60_001);
    expect(
      g.canActivate(context({ playerId: 7, ip: '1.1.1.1' }, handler)),
    ).toBe(true);
  });

  it('metadane @RateLimit po IP: 10/min na trasę, osobno dla różnych IP i tras', () => {
    const g = guard();
    const login = function login() {};
    const register = function register() {};
    const key: RateLimitKey = 'ip';
    Reflect.defineMetadata(RATE_LIMIT, key, login);
    Reflect.defineMetadata(RATE_LIMIT, key, register);
    for (let i = 0; i < 10; i++)
      expect(g.canActivate(context({ ip: '2.2.2.2' }, login))).toBe(true);
    let status = 0;
    try {
      g.canActivate(context({ ip: '2.2.2.2' }, login));
    } catch (e) {
      status = (e as HttpException).getStatus();
    }
    expect(status).toBe(429);
    expect(g.canActivate(context({ ip: '3.3.3.3' }, login))).toBe(true);
    expect(g.canActivate(context({ ip: '2.2.2.2' }, register))).toBe(true);
  });
});
