import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { parseEnv } from '../../src/infra/config/env.js';
import { configureApp } from '../../src/infra/http/configure-app.js';
import type { Clock } from '../../src/domain/time/index.js';
import { CLOCK } from '../../src/infra/time/time.module.js';

export type TestEnvOverrides = Partial<Record<string, string>>;

export interface CreateTestAppOptions {
  env?: TestEnvOverrides;
  clock?: Clock;
}

/** Buduje aplikację identycznie jak main.ts, na bazie z Testcontainers. */
export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<INestApplication> {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-12345',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    // Testy rejestrują dziesiątki kont z jednego IP; limit produkcyjny (10) sprawdza osobno http.e2e-spec.ts
    RATE_LIMIT_AUTH_PER_MINUTE: '100000',
    ...options.env,
  });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.clock) {
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app, env);
  await app.init();
  return app;
}
