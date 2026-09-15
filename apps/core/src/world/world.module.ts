import { Global, Module } from '@nestjs/common';
import { WorldInitService } from './world-init.service.js';
import { WorldSettingsRepository } from './world-settings.repository.js';
import { WorldStatusService } from './world-status.service.js';
import { WorldWritableGuard } from './world-writable.guard.js';

@Global()
@Module({
  providers: [WorldSettingsRepository, WorldWritableGuard, WorldInitService, WorldStatusService],
  exports: [WorldSettingsRepository, WorldWritableGuard, WorldInitService, WorldStatusService],
})
export class WorldModule {}
