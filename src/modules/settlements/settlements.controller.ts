import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ProfileGuard, type WorldRequest } from '../worlds/profile.guard.js';
import { SettlementDto } from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller('worlds/:id/settlements')
@UseGuards(ProfileGuard)
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get()
  @ApiQuery({
    name: 'bbox',
    required: false,
    example: '60,60,100,100',
    description: 'x1,y1,x2,y2 — domknięty, ≤ 4096 komórek',
  })
  @ApiOkResponse({ type: [SettlementDto] })
  @ApiBadRequestResponse({ description: 'Zły bbox' })
  list(
    @Req() req: WorldRequest,
    @Query('bbox') bbox?: string,
  ): Promise<SettlementDto[]> {
    return this.service.list(req.world, req.playerId, bbox);
  }
}
