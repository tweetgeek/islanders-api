import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer, CurrentWorld } from '../../access/current.decorators.js';
import type { PlayerPrincipal } from '../../access/player-request.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfilesRepository } from '../profiles/profiles.repository.js';
import { SettlementDto } from '../settlements/settlements.dto.js';
import type { OwnSettlementView } from '../settlements/settlement-views.js';
import { JoinService } from './join.service.js';
import { JoinWorldDto, WorldDto } from './world.dto.js';
import { type WorldView, worldView } from './world-views.js';

@ApiTags('world')
@ApiBearerAuth()
@Controller('v1')
export class WorldController {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly joins: JoinService,
  ) {}

  @Get('world')
  @ApiOkResponse({ type: WorldDto })
  async world(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
  ): Promise<WorldView> {
    return worldView(world, await this.profiles.find(player.id));
  }

  @Post('join')
  @HttpCode(201)
  @ApiCreatedResponse({ type: SettlementDto, description: 'Osada domowa (pełny widok) + serverTime' })
  @ApiConflictResponse({ description: 'Masz już profil, świat nie jest OPEN albo jest pełny' })
  join(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
    @Body() dto: JoinWorldDto,
  ): Promise<OwnSettlementView> {
    return this.joins.join(world, player, dto.name);
  }
}
