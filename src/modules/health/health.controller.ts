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

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch (err) {
      this.logger.error('Baza niedostępna', err);
      throw new ServiceUnavailableException({ status: 'down', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
