import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Clock } from '../../domain/time/index.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CLOCK } from '../time/time.module.js';

export type RateLimitKey = 'ip' | 'player';

export const RATE_LIMIT = 'rateLimit';
/** Jawny klucz limitu dla trasy, np. `@RateLimit('ip')` na logowaniu; wartość limitu z env. */
export const RateLimit = (key: RateLimitKey) => SetMetadata(RATE_LIMIT, key);

const WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Stałe okno w pamięci procesu (jedna instancja; Redis dojdzie w specu C).
 * Zastępuje @nestjs/throttler, który nie deklaruje zgodności z Nest 12.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ playerId?: number; ip?: string }>();
    const explicit = this.reflector.getAllAndOverride<RateLimitKey | undefined>(
      RATE_LIMIT,
      [context.getHandler(), context.getClass()],
    );
    const keyBy: RateLimitKey | null =
      explicit ?? (req.playerId !== undefined ? 'player' : null);
    if (!keyBy) return true;

    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const byPlayer = keyBy === 'player' && req.playerId !== undefined;
    const key = byPlayer
      ? `player:${req.playerId}`
      : `ip:${route}:${req.ip ?? 'unknown'}`;
    const limit = byPlayer
      ? this.env.RATE_LIMIT_PLAYER_PER_MINUTE
      : this.env.RATE_LIMIT_AUTH_PER_MINUTE;

    const now = this.clock.now().getTime();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
      this.sweep(now);
    }
    bucket.count++;
    if (bucket.count > limit) {
      throw new HttpException(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Za dużo żądań, spróbuj za chwilę',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private sweep(now: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets)
      if (b.resetAt <= now) this.buckets.delete(k);
  }
}
