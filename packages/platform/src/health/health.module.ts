import {
  Controller,
  Get,
  Inject,
  Logger,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { withTimeout } from '../util/with-timeout.js';

const CHECK_TIMEOUT_MS = 2_000;

/**
 * `live` sprawdza tylko, że proces odpowiada. `ready` sprawdza wyłącznie zależności, bez których
 * usługa nie obsłuży żadnego żądania — własny Postgres i Redis, nigdy inne usługi.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<Record<string, never>>,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; db: 'up'; redis: 'up' }> {
    const db = await this.probe('db', () => this.db.execute(sql`SELECT 1`));
    const redis = await this.probe('redis', () => this.redis.ping());
    if (db === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'down', db, redis });
    }
    return { status: 'ok', db, redis };
  }

  private async probe(name: string, check: () => Promise<unknown>): Promise<'up' | 'down'> {
    try {
      await withTimeout(check(), CHECK_TIMEOUT_MS);
      return 'up';
    } catch (err) {
      this.logger.error(`${name} niedostępny`, err instanceof Error ? err.message : String(err));
      return 'down';
    }
  }
}

/** Wymaga w aplikacji modułu bazy i RedisModule. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
