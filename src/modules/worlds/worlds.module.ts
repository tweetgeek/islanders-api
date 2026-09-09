import { Module } from '@nestjs/common';
import { ProfileGuard } from './profile.guard.js';
import { ProfilesRepository } from './profiles.repository.js';
import { WorldWritableGuard } from './world-writable.guard.js';
import { WorldsController } from './worlds.controller.js';
import { WorldsRepository } from './worlds.repository.js';
import { WorldsService } from './worlds.service.js';

@Module({
  controllers: [WorldsController],
  providers: [
    WorldsRepository,
    ProfilesRepository,
    WorldsService,
    ProfileGuard,
    WorldWritableGuard,
  ],
  exports: [
    WorldsRepository,
    ProfilesRepository,
    WorldsService,
    ProfileGuard,
    WorldWritableGuard,
  ],
})
export class WorldsModule {}
