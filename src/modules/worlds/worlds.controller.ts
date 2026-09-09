import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPlayer } from '../auth/current-player.decorator.js';
import { ProfileGuard, type WorldRequest } from './profile.guard.js';
import { WorldListItemDto, WorldStateDto } from './worlds.dto.js';
import { WorldsService } from './worlds.service.js';

@ApiTags('worlds')
@ApiBearerAuth()
@Controller('worlds')
export class WorldsController {
  constructor(private readonly service: WorldsService) {}

  @Get()
  @ApiOkResponse({ type: [WorldListItemDto] })
  list(@CurrentPlayer() playerId: number): Promise<WorldListItemDto[]> {
    return this.service.list(playerId);
  }

  @Get(':id/state')
  @UseGuards(ProfileGuard)
  @ApiOkResponse({ type: WorldStateDto })
  @ApiNotFoundResponse({ description: 'Świat nie istnieje' })
  @ApiForbiddenResponse({ description: 'Brak profilu na tym świecie' })
  state(@Req() req: WorldRequest): Omit<WorldStateDto, 'serverTime'> {
    return this.service.state(req.world, req.profile, req.playerId);
  }
}
