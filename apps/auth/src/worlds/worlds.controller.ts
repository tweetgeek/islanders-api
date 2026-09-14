import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { WorldListItem } from '@islanders/contracts';
import { RateLimitGuard } from '@islanders/platform';
import { AccessTokenGuard, CurrentPlayer, type PlayerPrincipal } from '../tokens/guards.js';
import { WorldsRepository } from './worlds.repository.js';

@ApiTags('worlds')
@ApiBearerAuth()
@Controller('v1/worlds')
@UseGuards(AccessTokenGuard, RateLimitGuard)
export class WorldsController {
  constructor(private readonly worlds: WorldsRepository) {}

  /** Bez `DRAFT`; świat testowy tylko dla ról tester i admin. */
  @Get()
  list(@CurrentPlayer() player: PlayerPrincipal): Promise<WorldListItem[]> {
    const includeTest = player.roles.includes('tester') || player.roles.includes('admin');
    return this.worlds.listVisible(player.id, includeTest);
  }
}
