import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer, CurrentWorld } from '../../access/current.decorators.js';
import type { PlayerPrincipal } from '../../access/player-request.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfileGuard } from '../profiles/profile.guard.js';
import { fleetViewFor } from './fleet-views.js';
import { FleetDto } from './fleets.dto.js';
import { FleetsRepository } from './fleets.repository.js';

@ApiTags('fleets')
@ApiBearerAuth()
@Controller('v1/fleets')
@UseGuards(ProfileGuard)
export class FleetsController {
  constructor(private readonly fleets: FleetsRepository) {}

  @Get()
  @ApiOkResponse({ type: [FleetDto] })
  async list(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
  ): Promise<FleetDto[]> {
    const rows = await this.fleets.listVisible(player.id);
    return rows.map((f) => fleetViewFor(f, world.slug, player.id));
  }
}
