import { Module, forwardRef } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsRepository } from './settlements.repository.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [forwardRef(() => WorldsModule)],
  controllers: [SettlementsController],
  providers: [SettlementsRepository, SettlementsService],
  exports: [SettlementsRepository],
})
export class SettlementsModule {}
