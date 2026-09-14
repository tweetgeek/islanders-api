import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule, TimeModule } from '@islanders/platform';
import { DbModule } from '../infra/db/db.module.js';
import { WorldModule } from '../world/world.module.js';

/** Kontekst komend technika: baza i świat, bez serwerów HTTP, bez auth i bez prac w tle. */
@Module({})
export class CliModule {
  static forRoot(env: { DATABASE_URL: string }): DynamicModule {
    return {
      module: CliModule,
      imports: [AppConfigModule.forRoot(env), DbModule, TimeModule, WorldModule],
    };
  }
}
