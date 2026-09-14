import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import { ENV } from '../config/config.module.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { CLOCK } from '../time/time.module.js';
import { withTimeout } from '../util/with-timeout.js';
import { retryAfterSeconds, windowKey } from './window.js';

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const REDIS_TIMEOUT_MS = 200;

/**
 * Stałe okno w Redisie, wspólne dla wszystkich replik. Przy niedostępnym Redisie przepuszcza
 * ruch: utrata limitu jest mniejszym złem niż zatrzymanie logowania dla wszystkich.
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: { RATE_LIMIT_PREFIX: string },
  ) {}

  async hit(
    bucket: string,
    subject: string,
    limit: number,
    windowMs = 60_000,
  ): Promise<RateLimitDecision> {
    const now = this.clock.now().getTime();
    const key = windowKey(this.env.RATE_LIMIT_PREFIX, bucket, subject, now, windowMs);
    // Klient poza stanem `ready` (rozłączony, łączy się ponownie) i tak nie wykona polecenia od
    // ręki — z `maxRetriesPerRequest: null` trafiłoby ono do kolejki offline ioredis i czekało
    // tam bezterminowo. Sprawdzamy status PRZED wysłaniem, żeby nic tam nie utknęło.
    if (this.redis.status !== 'ready') {
      this.logger.warn(`Limiter pominięty, Redis niedostępny (status: ${this.redis.status})`);
      return { allowed: true };
    }
    let count: number;
    try {
      const results = await withTimeout(
        this.redis.multi().incr(key).pexpire(key, windowMs * 2).exec(),
        REDIS_TIMEOUT_MS,
      );
      count = Number(results?.[0]?.[1]);
    } catch (err) {
      this.logger.warn(
        `Limiter pominięty, Redis niedostępny: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { allowed: true };
    }
    return count > limit
      ? { allowed: false, retryAfterSeconds: retryAfterSeconds(now, windowMs) }
      : { allowed: true };
  }
}
