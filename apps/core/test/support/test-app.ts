import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { inject } from 'vitest';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, InternalHttpServer, closeServer, listenInternal } from '@islanders/platform';
import { AppModule } from '../../src/app.module.js';
import { configureCoreApp } from '../../src/bootstrap.js';
import { parseEnv } from '../../src/infra/config/env.js';
import { servesPublicApi } from '../../src/infra/config/roles.js';
import { DB, type Db } from '../../src/infra/db/db.module.js';
import * as schema from '../../src/infra/db/schema/index.js';
import type { InitWorldInput } from '../../src/world/world-settings.repository.js';
import { type FakeAuth, startFakeAuth } from './fake-auth.js';
import { createTestDatabase } from './test-db.js';
import { TEST_ISSUER } from './tokens.js';

export interface CreateTestAppOptions {
  env?: Partial<Record<string, string>>;
  clock?: Clock;
  /** Nadpisania wiersza `world_settings`; `null` = baza bez świata. Domyślnie świat OPEN, seed 1337, 200×200. */
  world?: Partial<InitWorldInput> | null;
  /** Wspólny fałszywy auth (np. dla dwóch instancji); bez niego aplikacja dostaje własny. */
  fakeAuth?: FakeAuth;
  /** Istniejąca baza (druga instancja tego samego świata); bez niej powstaje nowa. */
  databaseUrl?: string;
}

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  internalHttp: () => ReturnType<typeof request>;
  db: Db;
  slug: string;
  fakeAuth: FakeAuth;
  databaseUrl: string;
  close(): Promise<void>;
}

/**
 * Aplikacja jak w main.ts, na własnej bazie i z własnym fałszywym auth. Serwer wiąże się jawnie
 * z 127.0.0.1: supertest bez adresu wiązałby `::`, co na macOS potrafi trafić w obcy proces
 * nasłuchujący po IPv4 na tym samym porcie (spec A §15.6).
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  if (options.databaseUrl && !options.world?.slug) {
    throw new Error('Przy databaseUrl podaj world.slug — druga instancja musi znać slug świata');
  }
  const databaseUrl = options.databaseUrl ?? (await createTestDatabase());
  const fakeAuth = options.fakeAuth ?? (await startFakeAuth());
  const slug = options.world?.slug ?? `world-${randomUUID().replace(/-/g, '').slice(0, 8)}`;

  if (options.world !== null && !options.databaseUrl) {
    const client = postgres(databaseUrl, { max: 1 });
    try {
      await drizzle(client, { schema })
        .insert(schema.worldSettings)
        .values({
          id: 1,
          slug,
          name: 'Świat testowy',
          status: 'OPEN',
          isTest: false,
          seed: 1337,
          width: 200,
          height: 200,
          windX: 0.3,
          windY: -0.1,
          ...options.world,
        });
    } finally {
      await client.end();
    }
  }

  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: inject('redisUrl'),
    WORLD_SLUG: slug,
    AUTH_INTERNAL_URL: fakeAuth.url,
    AUTH_ISSUER: TEST_ISSUER,
    RATE_LIMIT_IP_PER_MINUTE: '100000',
    RATE_LIMIT_PREFIX: `rl-test-${randomUUID()}`,
    // Prace w tle (outbox, zgłoszenie świata) testy włączają jawnie rolą all/worker.
    CORE_ROLE: 'api',
    PUBLIC_URL: `https://${slug}.islanders.test`,
    ADMIN_URL: 'http://127.0.0.1:3101',
    AUTH_CLIENT_ID: `core-${slug}`,
    AUTH_CLIENT_SECRET: 'sekret-testowy-core-0123456789abcdef',
    ...options.env,
  });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.clock) {
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureCoreApp(app, env);
  if (servesPublicApi(env)) {
    await app.listen(0, '127.0.0.1');
  } else {
    await app.init();
  }
  const internal = await listenInternal(app, 0, '127.0.0.1');
  app.get(InternalHttpServer).attach(internal);
  return {
    app,
    http: () => {
      if (!servesPublicApi(env)) throw new Error('Rola worker nie ma portu publicznego');
      return request(app.getHttpServer());
    },
    internalHttp: () => request(internal),
    db: app.get<Db>(DB),
    slug,
    fakeAuth,
    databaseUrl,
    close: async () => {
      await closeServer(internal);
      await app.close();
      if (!options.fakeAuth) await fakeAuth.close();
    },
  };
}
