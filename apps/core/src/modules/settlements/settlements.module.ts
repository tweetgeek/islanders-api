import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsRepository } from './settlements.repository.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [ProfilesModule],
  controllers: [SettlementsController],
  providers: [SettlementsRepository, SettlementsService],
  exports: [SettlementsRepository],
})
export class SettlementsModule {}
