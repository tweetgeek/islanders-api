import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { eventBatchSchema, type EventBatch } from '@islanders/contracts';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentServiceWorld, ServiceTokenGuard } from '../tokens/guards.js';
import { EventsService } from './events.service.js';

@ApiTags('internal')
@Controller('internal/v1/events')
@UseGuards(ServiceTokenGuard)
export class InternalEventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(200)
  ingest(
    @CurrentServiceWorld() serviceWorld: string,
    @Body(new ZodPipe(eventBatchSchema)) body: EventBatch,
  ): Promise<{ accepted: number; duplicates: number }> {
    return this.events.ingest(serviceWorld, body.events);
  }
}
