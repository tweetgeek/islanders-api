import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  AllExceptionsFilter,
  AppConfigModule,
  HealthModule,
  InternalHttpServer,
  RateLimitModule,
  RedisModule,
  ServerTimeInterceptor,
  TimeModule,
} from '@islanders/platform';
import type { AuthEnv } from './config/env.js';
import { AuthDbModule } from './db/db.js';
import { EventsModule } from './events/events.module.js';
import { PlayersModule } from './players/players.module.js';
import { ProbeModule } from './probe/probe.module.js';
import { ServiceClientsModule } from './service-clients/service-clients.module.js';
import { TokensModule } from './tokens/tokens.module.js';
import { WorldsModule } from './worlds/worlds.module.js';

@Module({})
export class AppModule {
  static forRoot(env: AuthEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        AuthDbModule,
        RedisModule,
        TimeModule,
        RateLimitModule,
        HealthModule,
        TokensModule,
        PlayersModule,
        ServiceClientsModule,
        WorldsModule,
        EventsModule,
        ProbeModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ServerTimeInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        InternalHttpServer,
      ],
    };
  }
}
