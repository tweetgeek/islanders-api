import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { FleetsController } from './fleets.controller.js';
import { FleetsRepository } from './fleets.repository.js';

@Module({
  imports: [ProfilesModule],
  controllers: [FleetsController],
  providers: [FleetsRepository],
  exports: [FleetsRepository],
})
export class FleetsModule {}
