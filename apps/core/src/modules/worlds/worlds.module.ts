import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SettlementsModule } from '../settlements/settlements.module.js';
import { JoinService } from './join.service.js';
import { WorldController } from './world.controller.js';

@Module({
  imports: [ProfilesModule, SettlementsModule],
  controllers: [WorldController],
  providers: [JoinService],
  exports: [JoinService],
})
export class WorldsModule {}
