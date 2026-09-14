import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { count } from 'drizzle-orm';
import { ToolsTokenGuard } from '../access/tools-token.guard.js';
import { DB, type Db } from '../infra/db/db.module.js';
import { settlements } from '../infra/db/schema/index.js';
import { ProfilesRepository } from '../modules/profiles/profiles.repository.js';
import { OutboxRepository } from '../outbox/outbox.repository.js';
import { WorldSettingsRepository, type WorldSettingsRow } from '../world/world-settings.repository.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/v1')
@UseGuards(ToolsTokenGuard)
export class AdminController {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    private readonly profiles: ProfilesRepository,
    @Inject(DB) private readonly db: Db,
    private readonly outbox: OutboxRepository,
  ) {}

  @Get('world')
  async world(): Promise<{
    settings: WorldSettingsRow;
    profiles: number;
    settlements: number;
    outbox: { pending: number; oldestPendingAt: string | null };
  }> {
    const [settings, profileCount, [settlementRow], outboxStats] = await Promise.all([
      this.worlds.get(),
      this.profiles.count(),
      this.db.select({ value: count() }).from(settlements),
      this.outbox.stats(),
    ]);
    return {
      settings,
      profiles: profileCount,
      settlements: Number(settlementRow.value),
      outbox: { pending: outboxStats.pending, oldestPendingAt: outboxStats.oldestPendingAt?.toISOString() ?? null },
    };
  }
}
