import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { REDIS, type RedisClient } from '../../infra/redis/redis.module.js';
import { Public } from '../auth/public.decorator.js';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up'; redis: 'up' }> {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch (err) {
      this.logger.error(
        'Baza niedostępna',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({ status: 'down', db: 'down' });
    }
    try {
      await this.redis.ping();
    } catch (err) {
      this.logger.error(
        'Redis niedostępny',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({ status: 'down', redis: 'down' });
    }
    return { status: 'ok', db: 'up', redis: 'up' };
  }
}
