import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentPlayer } from '../auth/current-player.decorator.js';
import { SettlementDto } from '../settlements/settlements.dto.js';
import { ProfileGuard, type WorldRequest } from './profile.guard.js';
import { JoinWorldDto, WorldListItemDto, WorldStateDto } from './worlds.dto.js';
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

  @Post(':id/join')
  @HttpCode(201)
  @ApiCreatedResponse({
    type: SettlementDto,
    description: 'Osada domowa (pełny widok) + serverTime',
  })
  @ApiConflictResponse({
    description: 'Już dołączyłeś, świat nie jest OPEN albo jest pełny',
  })
  @ApiNotFoundResponse({ description: 'Świat nie istnieje' })
  join(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: 404 }))
    worldId: number,
    @CurrentPlayer() playerId: number,
    @Body() dto: JoinWorldDto,
  ): Promise<SettlementDto> {
    return this.service.join(worldId, playerId, dto.name);
  }
}
