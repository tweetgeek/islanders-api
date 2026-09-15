import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InternalHttpServer, listenInternal } from '@islanders/platform';
import { AppModule } from './app.module.js';
import { configureCoreApp } from './bootstrap.js';
import { EnvValidationError, parseEnv } from './infra/config/env.js';
import { servesPublicApi } from './infra/config/roles.js';
import { WorldBindingError, assertWorldBinding } from './world/world-binding.js';
import { WorldSettingsRepository } from './world/world-settings.repository.js';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = parseEnv(process.env);
  const app = await NestFactory.create(AppModule.forRoot(env));
  const world = await assertWorldBinding(app.get(WorldSettingsRepository), env.WORLD_SLUG);
  configureCoreApp(app, env);
  if (servesPublicApi(env)) {
    await app.listen(env.PORT);
  } else {
    await app.init();
  }
  const internal = await listenInternal(app, env.ADMIN_PORT);
  // Zamknięcie serwera wewnętrznego w cyklu życia Nesta (beforeApplicationShutdown), bez własnych sygnałów.
  app.get(InternalHttpServer).attach(internal);
  new Logger('Bootstrap').log(
    `Świat ${world.slug} (${world.status}), rola ${env.CORE_ROLE}: ` +
      `${servesPublicApi(env) ? `publiczny :${env.PORT}, ` : ''}wewnętrzny :${env.ADMIN_PORT}`,
  );
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError || err instanceof WorldBindingError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
