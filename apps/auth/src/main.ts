import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnvValidationError, closeServer, listenInternal } from '@islanders/platform';
import { AppModule } from './app.module.js';
import { configureAuthApp } from './bootstrap.js';
import { parseAuthEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = parseAuthEnv(process.env);
  const app = await NestFactory.create(AppModule.forRoot(env));
  configureAuthApp(app, env);
  await app.listen(env.PORT);
  const internal = await listenInternal(app, env.ADMIN_PORT);
  const shutdown = async () => {
    await closeServer(internal);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  const logger = new Logger('Bootstrap');
  logger.log(`Auth: publiczny http://localhost:${env.PORT}, wewnętrzny http://localhost:${env.ADMIN_PORT}`);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
