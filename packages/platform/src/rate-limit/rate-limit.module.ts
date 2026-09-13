import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.js';

/** Wymaga w aplikacji RedisModule, TimeModule i AppConfigModule. */
@Global()
@Module({ providers: [RateLimiter], exports: [RateLimiter] })
export class RateLimitModule {}
