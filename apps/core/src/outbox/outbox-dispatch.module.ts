import { Module } from '@nestjs/common';
import { AuthClientModule } from '../auth-client/auth-client.module.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { WorldRegistrar } from './world-registrar.js';

@Module({
  imports: [AuthClientModule],
  providers: [OutboxDispatcher, WorldRegistrar],
  exports: [OutboxDispatcher, WorldRegistrar],
})
export class OutboxDispatchModule {}
