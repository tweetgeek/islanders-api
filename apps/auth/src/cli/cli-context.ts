import { existsSync } from 'node:fs';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { parseAuthEnv } from '../config/env.js';

/** Kontekst aplikacji bez serwera HTTP; zawsze zamykany, żeby proces CLI się zakończył. */
export async function withCliContext<T>(fn: (app: INestApplicationContext) => Promise<T>): Promise<T> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = parseAuthEnv({ ...process.env, WORLD_PROBE_INTERVAL: '0s' });
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(env), {
    logger: ['error', 'warn'],
  });
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}
