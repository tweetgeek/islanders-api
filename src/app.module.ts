import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from './infra/config/config.module.js';
import type { Env } from './infra/config/env.js';

@Module({})
export class AppModule {
  /** Składa aplikację z gotowej, zwalidowanej konfiguracji — brak zmiennej to błąd przed startem. */
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [AppConfigModule.forRoot(env)],
    };
  }
}
