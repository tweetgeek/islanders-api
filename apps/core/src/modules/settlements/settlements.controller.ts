import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer, CurrentWorld } from '../../access/current.decorators.js';
import type { PlayerPrincipal } from '../../access/player-request.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfileGuard } from '../profiles/profile.guard.js';
import { SettlementDto } from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller('v1/settlements')
@UseGuards(ProfileGuard)
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get()
  @ApiQuery({ name: 'bbox', required: false, example: '60,60,100,100', description: 'x1,y1,x2,y2 — domknięty, ≤ 4096 komórek' })
  @ApiOkResponse({ type: [SettlementDto] })
  @ApiBadRequestResponse({ description: 'Zły bbox' })
  list(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
    @Query('bbox') bbox?: string,
  ): Promise<SettlementDto[]> {
    return this.service.list(world, player.id, bbox);
  }
}
