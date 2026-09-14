import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureCoreApp } from './bootstrap.js';
import { EnvValidationError, parseEnv } from './infra/config/env.js';
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
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`Świat ${world.slug} (${world.status}) słucha na http://localhost:${env.PORT}`);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError || err instanceof WorldBindingError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
