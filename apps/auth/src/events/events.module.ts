import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { EventsService } from './events.service.js';
import { InternalEventsController } from './internal-events.controller.js';

@Module({
  imports: [WorldsModule],
  controllers: [InternalEventsController],
  providers: [EventsService],
})
export class EventsModule {}
