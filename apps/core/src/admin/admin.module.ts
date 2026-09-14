import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ToolsTokenGuard } from '../access/tools-token.guard.js';
import { ProfilesModule } from '../modules/profiles/profiles.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [AccessModule, ProfilesModule],
  controllers: [AdminController],
  providers: [ToolsTokenGuard],
})
export class AdminModule {}
