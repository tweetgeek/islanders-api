import { Module } from '@nestjs/common';
import { InternalWorldsController } from './internal-worlds.controller.js';
import { WorldsController } from './worlds.controller.js';
import { WorldsRepository } from './worlds.repository.js';

@Module({
  controllers: [WorldsController, InternalWorldsController],
  providers: [WorldsRepository],
  exports: [WorldsRepository],
})
export class WorldsModule {}
