import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { FleetsController } from './fleets.controller.js';
import { FleetsRepository } from './fleets.repository.js';

@Module({
  imports: [WorldsModule],
  controllers: [FleetsController],
  providers: [FleetsRepository],
  exports: [FleetsRepository],
})
export class FleetsModule {}
