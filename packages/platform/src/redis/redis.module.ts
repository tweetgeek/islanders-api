import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';

export const REDIS = Symbol('REDIS');
export type RedisClient = Redis;

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      // maxRetriesPerRequest musi być null, bo tego wymaga BullMQ od połączenia,
      // którego używa jako blokującego czytnika kolejki.
      useFactory: (env: { REDIS_URL: string }): RedisClient =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
