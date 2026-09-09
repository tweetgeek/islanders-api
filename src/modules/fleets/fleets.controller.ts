import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProfileGuard, type WorldRequest } from '../worlds/profile.guard.js';
import { fleetViewFor } from './fleet-views.js';
import { FleetDto } from './fleets.dto.js';
import { FleetsRepository } from './fleets.repository.js';

@ApiTags('fleets')
@ApiBearerAuth()
@Controller('worlds/:id/fleets')
@UseGuards(ProfileGuard)
export class FleetsController {
  constructor(private readonly fleets: FleetsRepository) {}

  @Get()
  @ApiOkResponse({ type: [FleetDto] })
  async list(@Req() req: WorldRequest): Promise<FleetDto[]> {
    const rows = await this.fleets.listVisible(req.world.id, req.playerId);
    return rows.map((f) => fleetViewFor(f, req.playerId));
  }
}
