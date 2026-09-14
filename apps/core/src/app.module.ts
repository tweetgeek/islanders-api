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
import { AccessModule } from './access/access.module.js';
import { AdminModule } from './admin/admin.module.js';
import type { Env } from './infra/config/env.js';
import { servesAdminApi } from './infra/config/roles.js';
import { DbModule } from './infra/db/db.module.js';
import { FleetsModule } from './modules/fleets/fleets.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { WorldsModule } from './modules/worlds/worlds.module.js';
import { WorldModule } from './world/world.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        DbModule,
        RedisModule,
        TimeModule,
        RateLimitModule,
        WorldModule,
        AccessModule,
        WorldsModule,
        SettlementsModule,
        FleetsModule,
        HealthModule,
        ...(servesAdminApi(env) ? [AdminModule] : []),
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ServerTimeInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        InternalHttpServer,
      ],
    };
  }
}
