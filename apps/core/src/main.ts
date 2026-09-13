import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { EnvValidationError, parseEnv } from './infra/config/env.js';
import { configureApp } from './infra/http/configure-app.js';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = parseEnv(process.env);
  const app = await NestFactory.create(AppModule.forRoot(env));
  configureApp(app, env);
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(
    `Islanders API słucha na http://localhost:${env.PORT}/api/v1`,
  );
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
