import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from './infra/config/config.module.js';
import type { Env } from './infra/config/env.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { PlayersModule } from './modules/players/players.module.js';
import { WorldsModule } from './modules/worlds/worlds.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { FleetsModule } from './modules/fleets/fleets.module.js';

@Module({})
export class AppModule {
  /** Składa aplikację z gotowej, zwalidowanej konfiguracji — brak zmiennej to błąd przed startem. */
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        HealthModule,
        AuthModule,
        PlayersModule,
        WorldsModule,
        SettlementsModule,
        FleetsModule,
      ],
    };
  }
}
