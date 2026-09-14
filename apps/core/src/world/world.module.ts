import { Global, Module } from '@nestjs/common';
import { WorldSettingsRepository } from './world-settings.repository.js';
import { WorldWritableGuard } from './world-writable.guard.js';

@Global()
@Module({
  providers: [WorldSettingsRepository, WorldWritableGuard],
  exports: [WorldSettingsRepository, WorldWritableGuard],
})
export class WorldModule {}
