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

/**
 * Buduje aplikację identycznie jak main.ts, na bazie z Testcontainers.
 *
 * Serwer HTTP wstaje TU, raz na plik, i to jawnie na `127.0.0.1`. Oba szczegóły są konieczne,
 * a nie kosmetyczne — supertest wywołany na serwerze bez adresu robi `server.listen(0)` przed
 * KAŻDYM żądaniem i zamyka serwer po nim. `listen(0)` bez hosta wiąże gniazdo `::` (IPv6
 * z trybem dwustosowym), a takie związanie jądro macOS przepuszcza nawet wtedy, gdy port
 * trzyma już obcy proces nasłuchujący WYŁĄCZNIE po IPv4 na `127.0.0.1` (IDE, launcher gry,
 * demon sterownika — na maszynie deweloperskiej jest ich w zakresie efemerycznym kilkanaście).
 * Supertest łączy się potem pod `http://127.0.0.1:<port>`, a dla adresu IPv4 wygrywa gniazdo
 * bardziej szczegółowe, czyli OBCE. Żądanie razem z danymi logowania i nagłówkiem
 * `Authorization` trafia wtedy do cudzego procesu, a test dostaje jego odpowiedź: 404, 401
 * albo 501, zależnie od tego, co tam siedzi. Porty efemeryczne macOS idą po kolei, więc trafienie
 * jest kwestią czasu: pełne okrążenie zakresu gwarantuje kolizję z każdym takim portem.
 *
 * Jawny `listen(0, '127.0.0.1')` wiąże dokładnie ten adres, pod który uderza supertest: obcy
 * serwer na tym porcie powoduje konflikt i jądro przydziela inny port, a gdy obcy serwer stoi
 * na masce (`*` albo `::`), to MY jesteśmy dopasowaniem szczegółowym i to my dostajemy żądanie.
 * Skoro serwer już nasłuchuje, supertest go nie podnosi ani nie zamyka — z ~130 związań portu
 * na przebieg robi się siedem, po jednym na plik.
 */
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
  await app.listen(0, '127.0.0.1');
  return app;
}
