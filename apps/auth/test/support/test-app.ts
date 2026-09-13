import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, closeServer, listenInternal } from '@islanders/platform';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureAuthApp } from '../../src/bootstrap.js';
import { parseAuthEnv } from '../../src/config/env.js';
import { keysEnv, testSigningKeys } from './keys.js';
import { serviceClientsEnv } from './service-clients.js';

export interface CreateTestAppOptions {
  env?: Partial<Record<string, string>>;
  clock?: Clock;
}

export interface TestApp {
  app: INestApplication;
  publicHttp: () => ReturnType<typeof request>;
  internalHttp: () => ReturnType<typeof request>;
  close(): Promise<void>;
}

/**
 * Buduje aplikację jak main.ts. Oba serwery wiążą się jawnie z 127.0.0.1 — powód opisuje
 * komentarz nad `createTestApp` w apps/core/test/support/test-app.ts.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  const env = parseAuthEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    REDIS_URL: inject('redisUrl'),
    AUTH_ISSUER: 'https://users.islanders.test',
    JWT_SIGNING_KEYS: keysEnv(testSigningKeys.active),
    SERVICE_CLIENTS: serviceClientsEnv(),
    RATE_LIMIT_AUTH_PER_MINUTE: '100000',
    RATE_LIMIT_IP_PER_MINUTE: '100000',
    RATE_LIMIT_PREFIX: `rl-test-${randomUUID()}`,
    WORLD_PROBE_INTERVAL: '0s',
    ...options.env,
  });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.clock) {
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureAuthApp(app, env);
  await app.listen(0, '127.0.0.1');
  const internal: Server = await listenInternal(app, 0, '127.0.0.1');
  return {
    app,
    publicHttp: () => request(app.getHttpServer()),
    internalHttp: () => request(internal),
    close: async () => {
      await closeServer(internal);
      await app.close();
    },
  };
}
