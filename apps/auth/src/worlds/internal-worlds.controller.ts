import { Body, Controller, ForbiddenException, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { worldRegistrationSchema, type WorldRegistration } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK } from '@islanders/platform';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentServiceWorld, ServiceTokenGuard } from '../tokens/guards.js';
import { WorldsRepository } from './worlds.repository.js';

@ApiTags('internal')
@Controller('internal/v1/worlds')
@UseGuards(ServiceTokenGuard)
export class InternalWorldsController {
  constructor(
    private readonly worlds: WorldsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Świat może zgłosić wyłącznie siebie. */
  @Put(':slug')
  @HttpCode(204)
  async register(
    @Param('slug') slug: string,
    @CurrentServiceWorld() serviceWorld: string,
    @Body(new ZodPipe(worldRegistrationSchema)) body: WorldRegistration,
  ): Promise<void> {
    if (slug !== serviceWorld) {
      throw new ForbiddenException('Klient może zgłaszać wyłącznie własny świat');
    }
    await this.worlds.upsert(slug, body, this.clock.now());
  }
}
