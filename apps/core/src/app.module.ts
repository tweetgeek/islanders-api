import { DynamicModule, Module } from '@nestjs/common';
import { RateLimitModule } from '@islanders/platform';
import { AppConfigModule } from './infra/config/config.module.js';
import type { Env } from './infra/config/env.js';
import { DbModule } from './infra/db/db.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { HttpModule } from './infra/http/http.module.js';
import { TimeModule } from './infra/time/time.module.js';
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
        DbModule,
        RedisModule,
        RateLimitModule,
        TimeModule,
        HealthModule,
        AuthModule,
        PlayersModule,
        WorldsModule,
        SettlementsModule,
        FleetsModule,
        // Na końcu: globalne strażniki działają w kolejności rejestracji, więc RateLimitGuard
        // musi wystartować po JwtAuthGuard, żeby widzieć ustawione przez niego `req.rateLimitSubject`.
        HttpModule,
      ],
    };
  }
}
