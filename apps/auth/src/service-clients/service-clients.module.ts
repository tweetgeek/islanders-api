import { Module } from '@nestjs/common';
import { ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { InternalTokenController } from './internal-token.controller.js';
import { SERVICE_CLIENTS, ServiceClients, parseServiceClients } from './service-clients.js';

@Module({
  controllers: [InternalTokenController],
  providers: [
    {
      provide: SERVICE_CLIENTS,
      inject: [ENV],
      useFactory: (env: AuthEnv) => new ServiceClients(parseServiceClients(env.SERVICE_CLIENTS)),
    },
  ],
})
export class ServiceClientsModule {}
