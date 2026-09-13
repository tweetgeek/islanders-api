# Spec A: fundament, geografia, konta, światy i odczyty — plan implementacji

> **Status: zrealizowany w monolicie; nie wykonywać ponownie.** Architektura zmieniona przez `docs/superpowers/specs/2026-09-13-architecture-split-design.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Działający backend NestJS, do którego klient Godot może się zarejestrować, dołączyć do świata, dostać osadę domową na lądzie i czytać stan świata, osady i floty zgodnie z regułami informacyjnymi, z geografią bit w bit zgodną z klientem.

**Architecture:** Czysty rdzeń domenowy w `src/domain/` (geografia na `BigInt`, reguły, balans, ekonomia, zegar) bez Nest i bez bazy; moduły Nest w `src/modules/` z kontrolerami, serwisami i repozytoriami na Drizzle; infrastruktura w `src/infra/` (konfiguracja zod, Drizzle i migracje, HTTP, Swagger). Testy jednostkowe biją w `domain/` i czyste funkcje widoków; testy e2e biją w HTTP na Postgresie z Testcontainers.

**Tech Stack:** Node 24, NestJS 12 (ESM, importy z `.js`), TypeScript 6, Vitest 4, Drizzle ORM 0.45 + postgres.js + drizzle-kit 0.31, PostgreSQL 17, zod 4, argon2, `@nestjs/jwt`, `@nestjs/swagger`, `@testcontainers/postgresql`, supertest.

**Spec:** `docs/superpowers/specs/2026-09-08-backend-foundation-geography-design.md` (plus `docs/adr/0001-biome-rule-enforced-by-foreign-keys.md` i słownik `../islanders/CONTEXT.md`).

## Global Constraints

- Wszystkie ścieżki HTTP pod `/api/v1`; Swagger pod `/api/docs` i `/api/docs-json` (bez prefiksu).
- Klucze JSON `camelCase`, współrzędne jako `{ "x": int, "y": int }`, znaczniki czasu przez `Date.prototype.toISOString()` (UTC, `Z`).
- `world` i `id` świata w JSON jako **string** (`"1"`), `ownerId` i `playerId` jako **liczby**.
- Cudza osada nigdy nie ma klucza `resources`. Nadchodząca cudza flota nigdy nie ma `ships` ani `cargo`.
- `hashCell` liczony wyłącznie na `BigInt`; `floor` to `Math.floor`; `int()` z GDScriptu to `Math.trunc`. Kolejność `RESOURCES` to `wood, stone, food, iron, sulfur`.
- Test parity porównuje **równością dokładną** (`toBe`), nigdy tolerancją, i **nigdy nie jest pomijany**: brak pliku to porażka.
- W `src/domain/` zero importów z `@nestjs/*`, `drizzle-orm`, `postgres` i zero `Date.now()`.
- Stos zamrożony: `@nestjs/*` 12.x, `drizzle-orm` 0.45.x, `drizzle-kit` 0.31.x, `zod` 4.x, `argon2` 0.45.x, `@testcontainers/postgresql` 12.x. Bez `@nestjs/throttler` (peer deps tylko do Nest 11), bez `@nestjs/config` i `@nestjs/terminus` (własne, krótsze odpowiedniki — patrz „Odstępstwa”).
- Kod w TypeScript, komentarze i komunikaty po polsku, identyfikatory po angielsku. Prettier: `singleQuote`, `trailingComma: all`.
- Każdy commit kończy się dwiema liniami:

```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01M8dt762nmkn45UizBL11GP
```

- Przed każdym commitem: `npm run lint` i `npm run build` przechodzą. Twierdzenie „testy przechodzą” wymaga wklejonego wyjścia komendy.
- Docker musi działać (`docker info`) do `npm run test:e2e` i do `docker compose up`.

## Odstępstwa od specu (uzasadnione faktami sprawdzonymi 2026-09-08)

| Spec mówi | Plan robi | Dlaczego |
|---|---|---|
| `@nestjs/throttler` | własny `RateLimitGuard` (Task 16), limity z `RATE_LIMIT_*_PER_MINUTE` | `@nestjs/throttler@6.5.0` ma peer deps `@nestjs/common ^7–^11`; `npm install` na Nest 12 kończy się `ERESOLVE` |
| `@nestjs/config` z zod | własny `AppConfigModule` z tokenem `ENV` (Task 1) | pełne typowanie bez `ConfigService.get`, mniej zależności, ten sam efekt |
| `@nestjs/terminus` | `HealthController` z `SELECT 1` (Task 3, 4) |
| nagłówek `X-Server-Time` z interceptora | middleware Express + interceptor tylko na pole `serverTime` (Task 16) |
| `pg-errors.ts` czyta `err.code` z wierzchu | `asPgError` przechodzi łańcuch `cause` (Task 4, runda 1) | `drizzle-orm` 0.45.2 zawsze opakowuje błąd sterownika w `DrizzleQueryError` i zostawia `PostgresError` pod `cause`; odczyt z wierzchu zwracałby `false` dla każdego błędu | jeden wskaźnik nie uzasadnia biblioteki |

Po wykonaniu planu należy nanieść te zmiany do specu (Task 17).

## Struktura plików

```
.env.example
docker-compose.yml
drizzle.config.ts
drizzle/                                  migracje SQL + meta (generowane, commitowane)
src/
  main.ts                                 bootstrap: parseEnv, NestFactory, configureApp, listen
  app.module.ts                           AppModule.forRoot(env) — składa moduły
  domain/
    time/clock.ts                         Clock, systemClock, FixedClock
    time/index.ts
    geography/constants.ts                stałe kontraktu
    geography/hash.ts                     hashCell, hash01
    geography/noise.ts                    lattice, smooth, valueNoise, fbm
    geography/island.ts                   landValue, biomeValue, biomeFromValue, islandAt, depositFor
    geography/index.ts
    geography/hash.spec.ts, noise.spec.ts, island.spec.ts, world-parity.spec.ts
    rules/resources.ts                    RESOURCES, Resource, Resources, emptyResources
    rules/biomes.ts                       BIOMES, Biome, biomeResources
    rules/buildings.ts                    BUILDINGS, COMMON_BUILDINGS, EXTRACTION_BUILDINGS, extractionBuildings, slotsFor, buildingExtracts
    rules/index.ts, rules/rules.spec.ts
    balance/balance.ts                    STARTER_PACK, BASE_RATE, startingBuildings, productionPerHour, capacityFor, populationMaxFor
    balance/index.ts, balance/balance.spec.ts
    economy/current-resources.ts          currentResources
    economy/index.ts, economy/current-resources.spec.ts
  infra/
    config/env.ts                         envSchema, Env, parseEnv, EnvValidationError
    config/config.module.ts               AppConfigModule.forRoot(env), token ENV
    config/env.spec.ts
    db/schema/enums.ts, citext.ts, worlds.ts, players.ts, profiles.ts, settlements.ts, buildings.ts, fleets.ts, deposits-taken.ts, refresh-tokens.ts, index.ts
    db/db.module.ts                       DbModule, tokeny DB i PG_CLIENT, typy Db, DbClient
    db/migrate.ts                         runMigrations(url)
    db/migrate-cli.ts                     wejście dla npm run db:migrate
    db/pg-errors.ts                       isUniqueViolation(err, constraint?)
    http/configure-app.ts                 configureApp(app, env)
    http/server-time.interceptor.ts       ServerTimeInterceptor
    http/all-exceptions.filter.ts         AllExceptionsFilter
    http/rate-limit.guard.ts              RateLimitGuard, @RateLimit()
    http/rate-limit.guard.spec.ts, server-time.interceptor.spec.ts
    swagger/setup-swagger.ts              setupSwagger(app)
    time/time.module.ts                   TimeModule, token CLOCK
  modules/
    health/health.controller.ts, health.module.ts
    auth/auth.module.ts, auth.controller.ts, auth.service.ts, auth.dto.ts, jwt-auth.guard.ts, public.decorator.ts, current-player.decorator.ts, refresh-tokens.repository.ts, tokens.ts
    auth/auth.service.spec.ts
    players/players.module.ts, players.repository.ts
    worlds/worlds.module.ts, worlds.controller.ts, worlds.service.ts, worlds.repository.ts, profiles.repository.ts, profile.guard.ts, world-writable.guard.ts, home-island-picker.ts, worlds.dto.ts, world-views.ts
    worlds/home-island-picker.spec.ts, world-writable.guard.spec.ts
    settlements/settlements.module.ts, settlements.controller.ts, settlements.service.ts, settlements.repository.ts, settlement-views.ts, bbox.ts
    settlements/settlement-views.spec.ts, bbox.spec.ts
    fleets/fleets.module.ts, fleets.controller.ts, fleets.repository.ts, fleet-views.ts
    fleets/fleet-views.spec.ts
  cli/create-world.ts
test/
  support/global-setup.ts                 Testcontainers Postgres, migracje, provide('databaseUrl')
  support/vitest.d.ts                     typ ProvidedContext
  support/test-app.ts                     createTestApp(), TestEnvOverrides
  support/fixtures.ts                     registerPlayer(), createWorld(), joinWorld()
  health.e2e-spec.ts, schema.e2e-spec.ts, auth.e2e-spec.ts, worlds.e2e-spec.ts, settlements.e2e-spec.ts, fleets.e2e-spec.ts, http.e2e-spec.ts
```

Pliki do usunięcia: `src/app.controller.ts`, `src/app.controller.spec.ts`, `src/app.service.ts`, `test/app.e2e-spec.ts`.

---

## Task 1: Konfiguracja env na zod i `AppConfigModule`

**Files:**
- Create: `src/infra/config/env.ts`, `src/infra/config/config.module.ts`, `src/infra/config/env.spec.ts`, `.env.example`
- Modify: `package.json` (zależności), `.gitignore` (dodać `.env`)

**Interfaces:**
- Produces: `parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env`, typ `Env` z polami `NODE_ENV`, `PORT: number`, `DATABASE_URL: string`, `REDIS_URL: string`, `JWT_SECRET: string`, `JWT_ACCESS_TTL: number` (sekundy), `JWT_REFRESH_TTL: number` (sekundy), `ISLANDERS_CLIENT_DIR: string`, `SWAGGER_ENABLED: boolean`, `RATE_LIMIT_AUTH_PER_MINUTE: number`, `RATE_LIMIT_PLAYER_PER_MINUTE: number`; klasa `EnvValidationError`; token `ENV` i `AppConfigModule.forRoot(env: Env): DynamicModule`.

- [ ] **Step 1: Zainstaluj zależności produkcyjne i deweloperskie tego planu**

```bash
npm install zod@^4 drizzle-orm@^0.45 postgres@^3.4 argon2@^0.45 @nestjs/jwt@^12 @nestjs/swagger@^12 class-validator@^0.15 class-transformer@^0.5
npm install -D drizzle-kit@^0.31 @testcontainers/postgresql@^12
```

`@nestjs/observe` zostaje jeszcze zainstalowany: `src/app.module.ts` i `src/main.ts` wciąż go importują, a odinstalowanie go teraz zepsułoby `npm run build` przed commitem. Usuwa go Task 2, razem z przepisaniem obu plików.

Oczekiwane: brak `ERESOLVE`, `package-lock.json` zaktualizowany.

- [ ] **Step 2: Napisz test schematu env**

`src/infra/config/env.spec.ts`:

```ts
import { parseEnv, EnvValidationError } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders',
  JWT_SECRET: 'x'.repeat(32),
};

describe('parseEnv', () => {
  it('stosuje wartości domyślne', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL).toBe(15 * 60);
    expect(env.JWT_REFRESH_TTL).toBe(30 * 24 * 3600);
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.ISLANDERS_CLIENT_DIR).toBe('../islanders');
    expect(env.RATE_LIMIT_AUTH_PER_MINUTE).toBe(10);
    expect(env.RATE_LIMIT_PLAYER_PER_MINUTE).toBe(120);
  });

  it('Swagger domyślnie włączony poza produkcją i wyłączony w produkcji', () => {
    expect(parseEnv(base).SWAGGER_ENABLED).toBe(true);
    expect(parseEnv({ ...base, NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
    expect(parseEnv({ ...base, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
    expect(parseEnv({ ...base, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
  });

  it('parsuje czasy życia tokenów do sekund', () => {
    const env = parseEnv({ ...base, JWT_ACCESS_TTL: '90s', JWT_REFRESH_TTL: '12h' });
    expect(env.JWT_ACCESS_TTL).toBe(90);
    expect(env.JWT_REFRESH_TTL).toBe(12 * 3600);
  });

  it('odrzuca brak JWT_SECRET z czytelnym komunikatem', () => {
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(EnvValidationError);
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/);
  });

  it('odrzuca za krótki JWT_SECRET i zły format TTL', () => {
    expect(() => parseEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => parseEnv({ ...base, JWT_ACCESS_TTL: '15 minutes' })).toThrow(/JWT_ACCESS_TTL/);
  });

  it('ignoruje zmienne spoza schematu', () => {
    expect(() => parseEnv({ ...base, PATH: '/usr/bin' })).not.toThrow();
  });
});
```

- [ ] **Step 3: Uruchom test i potwierdź porażkę**

Run: `npx vitest run src/infra/config/env.spec.ts`
Expected: FAIL — `Failed to load url ./env.js` (moduł nie istnieje).

- [ ] **Step 4: Zaimplementuj `env.ts`**

`src/infra/config/env.ts`:

```ts
import { z } from 'zod';

const DURATION_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** "15m" -> 900. Akceptuje wyłącznie liczbę całkowitą i jednostkę s, m, h albo d. */
export function durationToSeconds(text: string): number {
  const match = /^(\d+)([smhd])$/.exec(text);
  if (!match) {
    throw new Error(`niepoprawny czas trwania "${text}", użyj np. 15m, 12h, 30d`);
  }
  return Number(match[1]) * DURATION_UNITS[match[2]];
}

const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'użyj formatu 15m, 12h albo 30d');

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'musi zaczynać się od postgres://'),
    REDIS_URL: z.string().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32, 'co najmniej 32 znaki'),
    JWT_ACCESS_TTL: duration.default('15m').transform(durationToSeconds),
    JWT_REFRESH_TTL: duration.default('30d').transform(durationToSeconds),
    ISLANDERS_CLIENT_DIR: z.string().default('../islanders'),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_PLAYER_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  })
  .transform((e) => ({
    ...e,
    SWAGGER_ENABLED:
      e.SWAGGER_ENABLED === undefined ? e.NODE_ENV !== 'production' : e.SWAGGER_ENABLED === 'true',
  }));

export type Env = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(`Niepoprawna konfiguracja środowiska:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/** Waliduje surowe zmienne środowiskowe. Rzuca EnvValidationError zamiast startować z dziurą w konfiguracji. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new EnvValidationError(issues);
  }
  return result.data;
}
```

- [ ] **Step 5: Zaimplementuj `config.module.ts`**

`src/infra/config/config.module.ts`:

```ts
import { DynamicModule, Global, Module } from '@nestjs/common';
import type { Env } from './env.js';

/** Token do wstrzykiwania zwalidowanej konfiguracji: `@Inject(ENV) private readonly env: Env`. */
export const ENV = Symbol('ENV');

@Global()
@Module({})
export class AppConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
```

- [ ] **Step 6: Uruchom test i potwierdź sukces**

Run: `npx vitest run src/infra/config/env.spec.ts`
Expected: PASS, 6 testów.

- [ ] **Step 7: Dodaj `.env.example` i wpis w `.gitignore`**

`.env.example`:

```dotenv
# Port HTTP aplikacji
PORT=3000
# development | test | production
NODE_ENV=development
# Postgres z docker-compose.yml
DATABASE_URL=postgres://islanders:islanders@localhost:5432/islanders
# Redis z docker-compose.yml (używany od specu C)
REDIS_URL=redis://localhost:6379
# Min. 32 znaki. Wygeneruj: openssl rand -base64 48
JWT_SECRET=zmien-mnie-na-losowy-sekret-o-dlugosci-co-najmniej-32-znakow
# Czas życia tokenów: liczba + s|m|h|d
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
# Repozytorium klienta Godot; test parity czyta stamtąd contract/world-parity.json
ISLANDERS_CLIENT_DIR=../islanders
# Dokumentacja pod /api/docs. Domyślnie true poza production.
SWAGGER_ENABLED=true
# Limity zapytań na minutę: auth (register/login/refresh) na adres IP, reszta na gracza
RATE_LIMIT_AUTH_PER_MINUTE=10
RATE_LIMIT_PLAYER_PER_MINUTE=120
```

Do `.gitignore` dopisz na końcu:

```
# Konfiguracja lokalna
.env
```

- [ ] **Step 8: Lint i commit**

```bash
npm run lint && git add package.json package-lock.json .env.example .gitignore src/infra/config
git commit -m "Add zod-validated environment config module"
```

(dopisz trailer z Global Constraints do każdego commita w tym planie).

---

## Task 2: `docker-compose.yml`, `main.ts`, `configureApp`, `AppModule.forRoot`, usunięcie boilerplate

**Files:**
- Create: `docker-compose.yml`, `src/infra/http/configure-app.ts`
- Modify: `src/main.ts`, `src/app.module.ts`, `package.json` (skrypty)
- Delete: `src/app.controller.ts`, `src/app.controller.spec.ts`, `src/app.service.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Produces: `AppModule.forRoot(env: Env): DynamicModule`; `configureApp(app: INestApplication, env: Env): void` (prefix, ValidationPipe, shutdown hooks; Swagger i interceptory dochodzą w Task 3 i 15).

- [ ] **Step 1: Usuń boilerplate i `@nestjs/observe`**

```bash
git rm -q src/app.controller.ts src/app.controller.spec.ts src/app.service.ts test/app.e2e-spec.ts
npm uninstall @nestjs/observe
```

Po tym kroku `src/app.module.ts` i `src/main.ts` nie kompilują się, dopóki nie przepiszesz ich w krokach 4 i 5 — to jedyny moment w planie, gdy drzewo jest niekompletne, i domyka się przed commitem w kroku 9.

- [ ] **Step 2: Napisz `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: islanders
      POSTGRES_PASSWORD: islanders
      POSTGRES_DB: islanders
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U islanders -d islanders']
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
  redisdata:
```

- [ ] **Step 3: Napisz `configureApp`**

`src/infra/http/configure-app.ts`:

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Env } from '../config/env.js';

/**
 * Jedno miejsce konfiguracji aplikacji HTTP, wspólne dla main.ts i testów e2e,
 * żeby testy biły w dokładnie tę samą aplikację, która idzie na produkcję.
 */
export function configureApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  void env; // Swagger (Task 3) i interceptory (Task 15) użyją env
}
```

- [ ] **Step 4: Przepisz `app.module.ts`**

`src/app.module.ts`:

```ts
import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule } from './infra/config/config.module.js';
import type { Env } from './infra/config/env.js';

@Module({})
export class AppModule {
  /** Składa aplikację z gotowej, zwalidowanej konfiguracji — brak zmiennej to błąd przed startem. */
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [AppConfigModule.forRoot(env)],
    };
  }
}
```

- [ ] **Step 5: Przepisz `main.ts`**

`src/main.ts`:

```ts
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
  new Logger('Bootstrap').log(`Islanders API słucha na http://localhost:${env.PORT}/api/v1`);
}

bootstrap().catch((err: unknown) => {
  if (err instanceof EnvValidationError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
});
```

- [ ] **Step 6: Dodaj skrypty npm**

W `package.json` w `scripts` dopisz:

```json
"compose:up": "docker compose up -d --wait",
"compose:down": "docker compose down",
"db:generate": "drizzle-kit generate",
"db:migrate": "nest build && node dist/infra/db/migrate-cli.js",
"world:create": "nest build && node dist/cli/create-world.js"
```

(`db:migrate` i `world:create` zadziałają po Task 4 i Task 11; dodajemy je teraz, żeby `package.json` nie zmieniał się w każdym zadaniu.)

- [ ] **Step 7: Zbuduj i uruchom kontenery**

```bash
npm run build && npm run lint && npm run compose:up && docker compose ps
```

Expected: `dist/main.js` istnieje, oba kontenery `healthy`.

- [ ] **Step 8: Sprawdź start bez `.env`**

```bash
JWT_SECRET=$(printf 'x%.0s' {1..32}) DATABASE_URL=postgres://islanders:islanders@localhost:5432/islanders node dist/main.js &
APP_PID=$!
sleep 2
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/health
kill $APP_PID
env -u JWT_SECRET -u DATABASE_URL node dist/main.js; echo "kod wyjścia: $?"
```

Expected: najpierw `404` (aplikacja startuje, health dojdzie w Task 3), potem wyjście zaczynające się od `Niepoprawna konfiguracja środowiska:`, zawierające `JWT_SECRET`, i `kod wyjścia: 1`.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Bootstrap Nest app from validated env, add docker-compose with Postgres and Redis"
```

---

## Task 3: Szkielet modułów, health bez bazy, Swagger, harness e2e na Testcontainers

**Files:**
- Create: `src/modules/health/health.controller.ts`, `src/modules/health/health.module.ts`, `src/infra/swagger/setup-swagger.ts`, `test/support/global-setup.ts`, `test/support/vitest.d.ts`, `test/support/test-app.ts`, `test/health.e2e-spec.ts`
- Create (puste moduły): `src/modules/auth/auth.module.ts`, `src/modules/players/players.module.ts`, `src/modules/worlds/worlds.module.ts`, `src/modules/settlements/settlements.module.ts`, `src/modules/fleets/fleets.module.ts`, `src/domain/{time,geography,rules,balance,economy}/index.ts`
- Modify: `src/app.module.ts`, `src/infra/http/configure-app.ts`, `vitest.config.ts`, `vitest.config.e2e.ts`, `nest-cli.json`

**Interfaces:**
- Produces: `createTestApp(overrides?: TestEnvOverrides): Promise<INestApplication>` z `test/support/test-app.ts`; `inject('databaseUrl')` w e2e; `setupSwagger(app)`.

- [ ] **Step 1: Napisz test e2e health i Swaggera**

`test/health.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/test-app.js';

describe('health i swagger (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /api/v1/health -> 200 { status: "ok" }', async () => {
    app = await createTestApp();
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('Swagger JSON dostępny przy SWAGGER_ENABLED=true', async () => {
    app = await createTestApp({ SWAGGER_ENABLED: 'true' });
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.info.title).toBe('Islanders API');
    expect(res.body.paths['/api/v1/health']).toBeDefined();
  });

  it('Swagger wyłączony przy SWAGGER_ENABLED=false', async () => {
    app = await createTestApp({ SWAGGER_ENABLED: 'false' });
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
  });
});
```

- [ ] **Step 2: Napisz harness e2e**

`test/support/vitest.d.ts`:

```ts
declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
export {};
```

`test/support/global-setup.ts`:

```ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

let container: StartedPostgreSqlContainer | undefined;

/** Jeden kontener Postgresa na cały przebieg e2e; adres trafia do testów przez inject('databaseUrl'). */
export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = container.getConnectionUri();
  project.provide('databaseUrl', url);
  process.env.DATABASE_URL = url;
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
```

`test/support/test-app.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { parseEnv } from '../../src/infra/config/env.js';
import { configureApp } from '../../src/infra/http/configure-app.js';

export type TestEnvOverrides = Partial<Record<string, string>>;

/** Buduje aplikację identycznie jak main.ts, na bazie z Testcontainers. */
export async function createTestApp(overrides: TestEnvOverrides = {}): Promise<INestApplication> {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('databaseUrl'),
    JWT_SECRET: 'test-secret-test-secret-test-secret-12345',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '30d',
    ...overrides,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureApp(app, env);
  await app.init();
  return app;
}
```

`vitest.config.e2e.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['./test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
```

W `vitest.config.ts` (testy jednostkowe) dodaj tę samą linię `setupFiles`, bo klasy z dekoratorami Nest (`@Injectable()`) wywołują `Reflect.defineMetadata` już przy imporcie modułu:

```ts
    include: ['**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
```

- [ ] **Step 3: Uruchom e2e i potwierdź porażkę**

Run: `npm run test:e2e`
Expected: FAIL — `createTestApp` importuje działające moduły, ale `/api/v1/health` zwraca 404 i `/api/docs-json` 404 (kontener startuje poprawnie; jeśli nie, sprawdź `docker info`).

- [ ] **Step 4: Health i puste moduły**

`src/modules/health/health.controller.ts`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

`src/modules/health/health.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';

@Module({ controllers: [HealthController] })
export class HealthModule {}
```

Pięć pustych modułów o identycznym kształcie (zmień tylko nazwę klasy): `src/modules/auth/auth.module.ts` → `AuthModule`, `src/modules/players/players.module.ts` → `PlayersModule`, `src/modules/worlds/worlds.module.ts` → `WorldsModule`, `src/modules/settlements/settlements.module.ts` → `SettlementsModule`, `src/modules/fleets/fleets.module.ts` → `FleetsModule`:

```ts
import { Module } from '@nestjs/common';

@Module({})
export class AuthModule {}
```

Puste `index.ts` z treścią `export {};` w `src/domain/time`, `src/domain/geography`, `src/domain/rules`, `src/domain/balance`, `src/domain/economy`.

- [ ] **Step 5: Swagger**

`src/infra/swagger/setup-swagger.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Dokumentuje kontrakt, nie definiuje go: kształt JSON-a dyktuje klient, a sprawdzają testy e2e. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Islanders API')
    .setDescription('Backend gry Islanders. Wszystkie trasy poza /auth/* i /health wymagają Bearer JWT.')
    .setVersion('1')
    .addBearerAuth()
    .addTag('health')
    .addTag('auth')
    .addTag('worlds')
    .addTag('settlements')
    .addTag('fleets')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/docs-json' });
}
```

W `configureApp` zastąp linię `void env;` przez:

```ts
  if (env.SWAGGER_ENABLED) {
    setupSwagger(app);
  }
```

i dodaj import `import { setupSwagger } from '../swagger/setup-swagger.js';`.

W `nest-cli.json` dodaj plugin Swaggera:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": ["@nestjs/swagger"]
  }
}
```

W `app.module.ts` dodaj do `imports` po `AppConfigModule.forRoot(env)`: `HealthModule, AuthModule, PlayersModule, WorldsModule, SettlementsModule, FleetsModule` (z importami z `./modules/.../*.module.js`).

- [ ] **Step 6: Uruchom e2e i potwierdź sukces**

Run: `npm run test:e2e`
Expected: PASS, 3 testy. Run także: `npm test` → PASS (tylko `env.spec.ts`).

- [ ] **Step 7: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A && git commit -m "Add module skeleton, health endpoint, Swagger behind a flag and Testcontainers e2e harness"
```

---

## Task 4: Schemat Drizzle, migracje, `DbModule`, health z pingiem bazy

**Files:**
- Create: `drizzle.config.ts`, `src/infra/db/schema/{enums,citext,worlds,players,profiles,settlements,buildings,fleets,deposits-taken,refresh-tokens,index}.ts`, `src/infra/db/db.module.ts`, `src/infra/db/migrate.ts`, `src/infra/db/migrate-cli.ts`, `src/infra/db/pg-errors.ts`, `drizzle/*` (generowane), `test/schema.e2e-spec.ts`
- Modify: `src/modules/health/health.controller.ts`, `src/app.module.ts`, `test/support/global-setup.ts`

**Interfaces:**
- Produces: tokeny `DB`, `PG_CLIENT`; typy `Db`, `DbClient` (baza albo transakcja); tabele `worlds, players, profiles, settlements, biomeBuildings, buildings, fleets, depositsTaken, refreshTokens` i enumy `worldStatus, biomeType, buildingType, missionType`; `runMigrations(url, folder?)`; `isUniqueViolation(err, constraint?)`, `isForeignKeyViolation(err, constraint?)`.
- Nazwy ograniczeń używane później: `players_email_unique`, `players_nickname_unique`, `settlements_pk` (PK `(world_id, x, y)`), `profiles_pk`, `buildings_settlement_biome_fk`, `buildings_biome_type_fk`.

- [ ] **Step 1: Napisz test e2e schematu**

`test/schema.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { biomeBuildings, buildings, players, settlements, worlds } from '../src/infra/db/schema/index.js';
import { createTestApp } from './support/test-app.js';

describe('schemat bazy (e2e)', () => {
  let app: INestApplication;
  let db: Db;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<Db>(DB);
  });
  afterAll(async () => {
    await app.close();
  });

  it('biome_buildings ma 18 wierszy wstawionych migracją', async () => {
    const rows = await db.select().from(biomeBuildings);
    expect(rows).toHaveLength(18);
    expect(rows.filter((r) => r.biome === 'VOLCANIC').map((r) => r.type).sort()).toEqual(
      ['BARRACKS', 'IRON_MINE', 'SHIPYARD', 'SULFUR_PIT', 'TOWN_HALL', 'WAREHOUSE'],
    );
  });

  it('klucze obce odrzucają budynek spoza biomu i kłamstwo o biomie osady', async () => {
    const [world] = await db.insert(worlds).values({ seed: 1337, width: 200, height: 200 }).returning();
    const [player] = await db
      .insert(players)
      .values({ email: `schema-${Date.now()}@test.local`, nickname: `schema${Date.now()}`, passwordHash: 'x' })
      .returning();
    const base = { worldId: world.id, x: 5, y: 5 };
    await db.insert(settlements).values({
      ...base,
      ownerId: player.id,
      name: 'Wulkan',
      biome: 'VOLCANIC',
      wood: 0,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
      lastSyncAt: new Date(),
    });

    await expect(
      db.insert(buildings).values({ ...base, biome: 'VOLCANIC', type: 'SAWMILL', level: 1 }),
    ).rejects.toMatchObject({ code: '23503', constraint_name: 'buildings_biome_type_fk' });

    await expect(
      db.insert(buildings).values({ ...base, biome: 'TROPICAL', type: 'SAWMILL', level: 1 }),
    ).rejects.toMatchObject({ code: '23503', constraint_name: 'buildings_settlement_biome_fk' });

    await expect(
      db.insert(buildings).values({ ...base, biome: 'VOLCANIC', type: 'IRON_MINE', level: 1 }),
    ).resolves.toBeDefined();
  });

  it('CHECK odrzuca seed poza 31 bitami', async () => {
    await expect(db.insert(worlds).values({ seed: -1, width: 10, height: 10 })).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      db.execute(sql`INSERT INTO worlds (seed, width, height) VALUES (2147483648, 10, 10)`),
    ).rejects.toMatchObject({ code: '22003' });
  });
});
```

(Ostatnia asercja: `2147483648` nie mieści się w `integer`, więc Postgres zgłasza `22003` zanim dojdzie do CHECK — to też jest dowód, że seed nie przekroczy 31 bitów.)

- [ ] **Step 2: Uruchom e2e i potwierdź porażkę**

Run: `npm run test:e2e -- test/schema.e2e-spec.ts`
Expected: FAIL — brak modułu `db.module.js`.

- [ ] **Step 3: Enumy i typ `citext`**

`src/infra/db/schema/enums.ts`:

```ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const worldStatus = pgEnum('world_status', ['OPEN', 'CLOSED', 'ENDED']);
export const biomeType = pgEnum('biome_type', ['TROPICAL', 'TEMPERATE', 'VOLCANIC']);
export const buildingType = pgEnum('building_type', [
  'TOWN_HALL',
  'BARRACKS',
  'SHIPYARD',
  'WAREHOUSE',
  'SAWMILL',
  'QUARRY',
  'FARM',
  'IRON_MINE',
  'SULFUR_PIT',
]);
export const missionType = pgEnum('mission_type', ['COLONIZE', 'ATTACK', 'TRANSPORT', 'EXPEDITION', 'RETURN']);
```

`src/infra/db/schema/citext.ts`:

```ts
import { customType } from 'drizzle-orm/pg-core';

/** Tekst porównywany bez rozróżniania wielkości liter; wymaga `CREATE EXTENSION citext` (migracja 0000). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});
```

- [ ] **Step 4: Tabele**

`src/infra/db/schema/worlds.ts`:

```ts
import { sql } from 'drizzle-orm';
import { check, doublePrecision, integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';
import { worldStatus } from './enums.js';

export const worlds = pgTable(
  'worlds',
  {
    id: serial('id').primaryKey(),
    seed: integer('seed').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    windX: doublePrecision('wind_x').notNull().default(0),
    windY: doublePrecision('wind_y').notNull().default(0),
    status: worldStatus('status').notNull().default('OPEN'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('worlds_seed_31bit', sql`${t.seed} >= 0 AND ${t.seed} <= 2147483647`)],
);
```

`src/infra/db/schema/players.ts`:

```ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { citext } from './citext.js';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  email: citext('email').notNull().unique(),
  nickname: citext('nickname').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

`src/infra/db/schema/profiles.ts`:

```ts
import { integer, pgTable, primaryKey, timestamp } from 'drizzle-orm/pg-core';
import { players } from './players.js';
import { worlds } from './worlds.js';

/** Profile ze słownika: obecność gracza na jednym świecie. NULL w home_* = profil bez osad. */
export const profiles = pgTable(
  'profiles',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    homeX: integer('home_x'),
    homeY: integer('home_y'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'profiles_pk', columns: [t.worldId, t.playerId] })],
);
```

`src/infra/db/schema/settlements.ts`:

```ts
import { index, integer, numeric, pgTable, primaryKey, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { biomeType } from './enums.js';
import { players } from './players.js';
import { worlds } from './worlds.js';

const amount = (name: string) => numeric(name, { precision: 14, scale: 4, mode: 'number' }).notNull();

/** Tożsamością osady jest pozycja (ADR 0001 klienta). Biom przechowywany celowo (ADR 0001 backendu). */
export const settlements = pgTable(
  'settlements',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 32 }).notNull(),
    biome: biomeType('biome').notNull(),
    wood: amount('wood'),
    stone: amount('stone'),
    food: amount('food'),
    iron: amount('iron'),
    sulfur: amount('sulfur'),
    population: integer('population').notNull().default(0),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }).notNull(),
    foundedAt: timestamp('founded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'settlements_pk', columns: [t.worldId, t.x, t.y] }),
    unique('settlements_world_xy_biome_unique').on(t.worldId, t.x, t.y, t.biome),
    index('settlements_world_owner_idx').on(t.worldId, t.ownerId),
  ],
);
```

`src/infra/db/schema/buildings.ts`:

```ts
import { sql } from 'drizzle-orm';
import { check, foreignKey, integer, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { biomeType, buildingType } from './enums.js';
import { settlements } from './settlements.js';

/** 18 dozwolonych par (biom, budynek), wstawianych migracją 0002. */
export const biomeBuildings = pgTable(
  'biome_buildings',
  {
    biome: biomeType('biome').notNull(),
    type: buildingType('type').notNull(),
  },
  (t) => [primaryKey({ columns: [t.biome, t.type] })],
);

export const buildings = pgTable(
  'buildings',
  {
    worldId: integer('world_id').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    biome: biomeType('biome').notNull(),
    type: buildingType('type').notNull(),
    level: integer('level').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.x, t.y, t.type] }),
    foreignKey({
      name: 'buildings_settlement_biome_fk',
      columns: [t.worldId, t.x, t.y, t.biome],
      foreignColumns: [settlements.worldId, settlements.x, settlements.y, settlements.biome],
    }).onDelete('cascade'),
    foreignKey({
      name: 'buildings_biome_type_fk',
      columns: [t.biome, t.type],
      foreignColumns: [biomeBuildings.biome, biomeBuildings.type],
    }),
    check('buildings_level_nonnegative', sql`${t.level} >= 0`),
  ],
);
```

`src/infra/db/schema/fleets.ts`:

```ts
import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { missionType } from './enums.js';
import { players } from './players.js';
import { worlds } from './worlds.js';

export type FleetCargo = { units: Record<string, number>; resources: Record<string, number> };

export const fleets = pgTable(
  'fleets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    mission: missionType('mission').notNull(),
    fromX: integer('from_x').notNull(),
    fromY: integer('from_y').notNull(),
    toX: integer('to_x').notNull(),
    toY: integer('to_y').notNull(),
    ships: jsonb('ships').$type<Record<string, number>>().notNull().default({}),
    cargo: jsonb('cargo').$type<FleetCargo>().notNull().default({ units: {}, resources: {} }),
    departAt: timestamp('depart_at', { withTimezone: true }).notNull(),
    arriveAt: timestamp('arrive_at', { withTimezone: true }).notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('fleets_world_owner_idx').on(t.worldId, t.ownerId),
    index('fleets_world_target_idx').on(t.worldId, t.toX, t.toY),
  ],
);
```

`src/infra/db/schema/deposits-taken.ts`:

```ts
import { integer, numeric, pgTable, primaryKey } from 'drizzle-orm/pg-core';
import { worlds } from './worlds.js';

const taken = (name: string) => numeric(name, { precision: 14, scale: 4, mode: 'number' }).notNull().default(0);

/** Odchylenie od znaleziska wyliczonego z seeda: ile już zabrano. Używane od specu C. */
export const depositsTaken = pgTable(
  'deposits_taken',
  {
    worldId: integer('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    wood: taken('wood'),
    stone: taken('stone'),
    food: taken('food'),
    iron: taken('iron'),
    sulfur: taken('sulfur'),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.x, t.y] })],
);
```

`src/infra/db/schema/refresh-tokens.ts`:

```ts
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { players } from './players.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Ustawione = rotacja (podlega oknu łaski 60 s); NULL przy revokedAt = logout, natychmiastowy. */
    replacedById: uuid('replaced_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('refresh_tokens_hash_idx').on(t.tokenHash)],
);
```

`src/infra/db/schema/index.ts`:

```ts
export * from './enums.js';
export * from './worlds.js';
export * from './players.js';
export * from './profiles.js';
export * from './settlements.js';
export * from './buildings.js';
export * from './fleets.js';
export * from './deposits-taken.js';
export * from './refresh-tokens.js';
```

- [ ] **Step 5: `drizzle.config.ts`, migracje**

`drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://islanders:islanders@localhost:5432/islanders',
  },
  strict: true,
  verbose: true,
});
```

Wygeneruj trzy migracje w tej kolejności:

```bash
npx drizzle-kit generate --custom --name citext_extension
```

Otwórz `drizzle/0000_citext_extension.sql` i wpisz:

```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

```bash
npx drizzle-kit generate --name initial_schema
```

Sprawdź, że `drizzle/0001_initial_schema.sql` zawiera `CREATE TYPE "public"."biome_type"`, `CREATE TABLE "buildings"`, `CONSTRAINT "buildings_biome_type_fk"`, `CONSTRAINT "buildings_settlement_biome_fk"`, `CONSTRAINT "worlds_seed_31bit"` i kolumny `"email" citext`.

```bash
npx drizzle-kit generate --custom --name seed_biome_buildings
```

Do `drizzle/0002_seed_biome_buildings.sql` wpisz:

```sql
INSERT INTO "biome_buildings" ("biome", "type") VALUES
  ('TROPICAL', 'TOWN_HALL'), ('TROPICAL', 'BARRACKS'), ('TROPICAL', 'SHIPYARD'), ('TROPICAL', 'WAREHOUSE'),
  ('TROPICAL', 'SAWMILL'), ('TROPICAL', 'FARM'),
  ('TEMPERATE', 'TOWN_HALL'), ('TEMPERATE', 'BARRACKS'), ('TEMPERATE', 'SHIPYARD'), ('TEMPERATE', 'WAREHOUSE'),
  ('TEMPERATE', 'QUARRY'), ('TEMPERATE', 'FARM'),
  ('VOLCANIC', 'TOWN_HALL'), ('VOLCANIC', 'BARRACKS'), ('VOLCANIC', 'SHIPYARD'), ('VOLCANIC', 'WAREHOUSE'),
  ('VOLCANIC', 'IRON_MINE'), ('VOLCANIC', 'SULFUR_PIT');
```

- [ ] **Step 6: Migrator, CLI, błędy Postgresa**

`src/infra/db/migrate.ts`:

```ts
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Uruchamia migracje z katalogu `drizzle/` na wskazanej bazie i zamyka połączenie. */
export async function runMigrations(
  url: string,
  migrationsFolder: string = path.resolve(process.cwd(), 'drizzle'),
): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
```

`src/infra/db/migrate-cli.ts`:

```ts
import { existsSync } from 'node:fs';
import { parseEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
await runMigrations(env.DATABASE_URL);
console.log('Migracje zastosowane.');
```

`src/infra/db/pg-errors.ts`:

```ts
type PgError = { code?: string; constraint_name?: string };

function asPgError(err: unknown): PgError | null {
  return typeof err === 'object' && err !== null && 'code' in err ? (err as PgError) : null;
}

/** 23505 = naruszenie unikalności; opcjonalnie tylko dla konkretnego ograniczenia. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = asPgError(err);
  return e?.code === '23505' && (constraint === undefined || e.constraint_name === constraint);
}

/** 23503 = naruszenie klucza obcego. */
export function isForeignKeyViolation(err: unknown, constraint?: string): boolean {
  const e = asPgError(err);
  return e?.code === '23503' && (constraint === undefined || e.constraint_name === constraint);
}
```

- [ ] **Step 7: `DbModule`**

`src/infra/db/db.module.ts`:

```ts
import { Global, Inject, Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import * as schema from './schema/index.js';

export const DB = Symbol('DB');
export const PG_CLIENT = Symbol('PG_CLIENT');

export type Db = PostgresJsDatabase<typeof schema>;
/** Baza albo transakcja — repozytoria przyjmują oba, żeby dało się je składać w jedną transakcję. */
export type DbClient = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

@Injectable()
class DbShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_CLIENT,
      inject: [ENV],
      useFactory: (env: Env): Sql => postgres(env.DATABASE_URL, { max: 10 }),
    },
    {
      provide: DB,
      inject: [PG_CLIENT],
      useFactory: (client: Sql): Db => drizzle(client, { schema }),
    },
    DbShutdown,
  ],
  exports: [DB, PG_CLIENT],
})
export class DbModule {}
```

Dodaj `DbModule` do `imports` w `AppModule.forRoot` zaraz po `AppConfigModule.forRoot(env)`.

- [ ] **Step 8: Health pinguje bazę; migracje w global-setup**

`src/modules/health/health.controller.ts`:

```ts
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'down', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
```

W `test/support/global-setup.ts` po `project.provide(...)` dodaj:

```ts
  await runMigrations(url);
```

z importem `import { runMigrations } from '../../src/infra/db/migrate.js';`.

- [ ] **Step 9: Uruchom e2e i potwierdź sukces**

Run: `npm run test:e2e`
Expected: PASS — `health.e2e-spec.ts` (3) i `schema.e2e-spec.ts` (3).

- [ ] **Step 10: Sprawdź migrację na compose i commit**

```bash
npm run compose:up && cp -n .env.example .env; npm run db:migrate
```

Expected: `Migracje zastosowane.` Następnie:

```bash
npm run lint && git add -A && git commit -m "Add Drizzle schema with FK-enforced biome rule, migrations, DbModule and DB health check"
```

---

## Task 5: Geografia — `hashCell` i `hash01` na `BigInt`

**Files:**
- Create: `src/domain/geography/hash.ts`, `src/domain/geography/hash.spec.ts`
- Modify: `src/domain/geography/index.ts`

**Interfaces:**
- Produces: `hashCell(seed: number, x: number, y: number): number` (wynik w `[0, 2^31-1]`), `hash01(h: number): number` (w `[0, 1)`).

- [ ] **Step 1: Napisz test ze złotymi wartościami**

`src/domain/geography/hash.spec.ts`:

```ts
import { hash01, hashCell } from './hash.js';

describe('hashCell', () => {
  it.each([
    [1337, 0, 0, 983106472],
    [1337, 103, 100, 252586155],
    [1337, -5, 7, 575219644],
    [42, 1234, -987, 1703142128],
  ])('hashCell(%i, %i, %i) = %i (złote wiersze z api-guidelines 4.6)', (seed, x, y, expected) => {
    expect(hashCell(seed, x, y)).toBe(expected);
  });

  it('nie jest podatny na 32-bitową arytmetykę number (błędny wynik to 252586152)', () => {
    expect(hashCell(1337, 103, 100)).not.toBe(252586152);
  });

  it('akceptuje seed powyżej 31 bitów, maskując go jak GDScript', () => {
    // seed + i * 1013 w fbm może przekroczyć 31 bitów; wynik musi być identyczny z zamaskowanym wejściem
    expect(hashCell(2 ** 31 + 5, 3, 4)).toBe(hashCell(5, 3, 4));
  });

  it('wynik zawsze w [0, 2^31 - 1]', () => {
    for (const [s, x, y] of [
      [0, 0, 0],
      [2147483647, 199, 199],
      [1, -1000, -1000],
    ]) {
      const h = hashCell(s, x, y);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(2147483647);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

describe('hash01', () => {
  it('(h % 10007) / 10007', () => {
    expect(hash01(0)).toBe(0);
    expect(hash01(10006)).toBe(10006 / 10007);
    expect(hash01(10007)).toBe(0);
    expect(hash01(983106472)).toBe((983106472 % 10007) / 10007);
  });
});
```

- [ ] **Step 2: Uruchom test i potwierdź porażkę**

Run: `npx vitest run src/domain/geography/hash.spec.ts`
Expected: FAIL — brak modułu `hash.js`.

- [ ] **Step 3: Zaimplementuj**

`src/domain/geography/hash.ts`:

```ts
const MASK_31 = 0x7fffffffn;

/**
 * 31-bitowy hasz komórki, dosłownie z `WorldGrid.hash_cell` klienta (ADR 0001, załącznik pkt 1).
 * Każdy krok liczony na BigInt: iloczyn pośredni sięga 2,7e18, poza Number.MAX_SAFE_INTEGER,
 * a operatory bitowe na number działają tylko na 32 bitach. Konwersja do number dopiero na końcu,
 * gdzie wynik ma gwarantowane 31 bitów.
 */
export function hashCell(seed: number, x: number, y: number): number {
  let h = BigInt(seed) & MASK_31;
  h = (h * 31n + BigInt(x) + 1000003n) & MASK_31;
  h = (h * 31n + BigInt(y) + 1000033n) & MASK_31;
  h = ((h ^ (h >> 13n)) * 1274126177n) & MASK_31;
  return Number(h);
}

/** `WorldGrid.hash01`: (h % 10007) / 10007, w [0, 1). Wejście nieujemne, więc number wystarcza. */
export function hash01(h: number): number {
  return (h % 10007) / 10007.0;
}
```

`src/domain/geography/index.ts`:

```ts
export * from './hash.js';
```

- [ ] **Step 4: Uruchom test i potwierdź sukces**

Run: `npx vitest run src/domain/geography/hash.spec.ts`
Expected: PASS, 8 testów.

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/domain/geography && git commit -m "Add BigInt cell hash matching the client contract"
```

---

## Task 6: Geografia — szum wartościowy, `fbm`, `islandAt`, znalezisko

**Files:**
- Create: `src/domain/geography/constants.ts`, `src/domain/geography/noise.ts`, `src/domain/geography/island.ts`, `src/domain/geography/noise.spec.ts`, `src/domain/geography/island.spec.ts`
- Modify: `src/domain/geography/index.ts`

**Interfaces:**
- Consumes: `hashCell`, `hash01` (Task 5).
- Produces: stałe `LAND_FREQUENCY, LAND_THRESHOLD, BIOME_FREQUENCY, BIOME_BAND, DEPOSIT_CHANCE, RADIUS_MIN, RADIUS_MAX, OCTAVE_SALT, RESOURCE_ORDER`; `valueNoise(seed, x, y)`, `fbm(seed, x, y, octaves)`; `landValue(seed, x, y)`, `biomeValue(seed, x, y)`, `biomeFromValue(b): Biome`, `depositFor(biome, h): Deposit`, `islandAt(seed, x, y): Island | null`; typy `Biome = 'TROPICAL' | 'TEMPERATE' | 'VOLCANIC'`, `Deposit = Partial<Record<ResourceName, number>>`, `Island = { x, y, hash, biome, radius, deposit }`.

Uwaga: geografia definiuje własny, lokalny typ `Biome` i listę `RESOURCE_ORDER`, bo jest **kontraktem** i nie może zależeć od tego, jak reguły gry (Task 8) nazwą swoje typy. Task 8 sprawdza testem, że oba się zgadzają.

- [ ] **Step 1: Napisz testy szumu i wyspy**

`src/domain/geography/noise.spec.ts`:

```ts
import { fbm, smooth, valueNoise } from './noise.js';

describe('smooth', () => {
  it('t*t*(3-2t)', () => {
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(0.25)).toBe(0.25 * 0.25 * (3 - 2 * 0.25));
  });
});

describe('valueNoise', () => {
  it('w punktach całkowitych zwraca wartość siatki w [-1, 1)', () => {
    const v = valueNoise(1337, 3, 4);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThan(1);
    expect(valueNoise(1337, 3.0, 4.0)).toBe(v);
  });

  it('używa podłogi matematycznej dla ujemnych współrzędnych', () => {
    // floor(-0.5) = -1, trunc(-0.5) = 0 — gdyby użyto trunc, wynik byłby inny niż dla komórki -1
    const withFloor = valueNoise(7, -0.5, 0);
    expect(Number.isFinite(withFloor)).toBe(true);
    expect(withFloor).not.toBe(valueNoise(7, 0.5, 0));
  });
});

describe('fbm', () => {
  it('jedna oktawa równa się valueNoise', () => {
    expect(fbm(1337, 1.2, 3.4, 1)).toBe(valueNoise(1337, 1.2, 3.4));
  });

  it('dwie oktawy: (n0 + 0.5 * n1(seed + 1013, 2x, 2y)) / 1.5 w tej kolejności działań', () => {
    const x = 0.36;
    const y = 12.0;
    let total = 0.0;
    let norm = 0.0;
    let amp = 1.0;
    let freq = 1.0;
    for (let i = 0; i < 2; i++) {
      total += amp * valueNoise(1337 + i * 1013, x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.0;
    }
    expect(fbm(1337, x, y, 2)).toBe(total / norm);
  });
});
```

`src/domain/geography/island.spec.ts`:

```ts
import { biomeFromValue, biomeValue, depositFor, islandAt, landValue } from './island.js';
import { hashCell } from './hash.js';

describe('złote wiersze z api-guidelines 4.6 (land, biome)', () => {
  it.each([
    [1337, 0, 0, 0.52106858532360678, -0.88707904466873189],
    [1337, 103, 100, -0.26560642750074925, -0.31056894613770364],
    [1337, -5, 7, -0.48523097151887001, -0.66758352130138876],
    [42, 1234, -987, 0.2035859474073860, -0.32286378155278411],
  ])('seed %i, (%i, %i): land %d, biome %d', (seed, x, y, land, biome) => {
    expect(landValue(seed, x, y)).toBe(land);
    expect(biomeValue(seed, x, y)).toBe(biome);
  });
});

describe('biomeFromValue', () => {
  it('pasma BIOME_BAND = 0.15', () => {
    expect(biomeFromValue(-0.1500001)).toBe('TROPICAL');
    expect(biomeFromValue(-0.15)).toBe('TEMPERATE');
    expect(biomeFromValue(0)).toBe('TEMPERATE');
    expect(biomeFromValue(0.15)).toBe('TEMPERATE');
    expect(biomeFromValue(0.1500001)).toBe('VOLCANIC');
  });
});

describe('islandAt', () => {
  it('(1337, 0, 0) to tropikalna wyspa o promieniu 103.89427400819426 bez znaleziska (z world-parity.json)', () => {
    const island = islandAt(1337, 0, 0);
    expect(island).not.toBeNull();
    expect(island!.hash).toBe(983106472);
    expect(island!.biome).toBe('TROPICAL');
    expect(island!.radius).toBe(103.89427400819426);
    expect(island!.deposit).toEqual({});
  });

  it('(1337, 103, 100) to morze', () => {
    expect(islandAt(1337, 103, 100)).toBeNull();
  });

  it('gęstość lądu na 100x100 dla seeda 1337 mieści się w 15–22 %', () => {
    let land = 0;
    for (let x = 0; x < 100; x++) for (let y = 0; y < 100; y++) if (islandAt(1337, x, y)) land++;
    expect(land / 10000).toBeGreaterThan(0.15);
    expect(land / 10000).toBeLessThan(0.22);
  });
});

describe('depositFor', () => {
  it('zawiera wyłącznie zasoby spoza biomu, 1–2 pozycje, ilości całkowite w [200, 999]', () => {
    const foreignOf = {
      TROPICAL: ['stone', 'iron', 'sulfur'],
      TEMPERATE: ['wood', 'iron', 'sulfur'],
      VOLCANIC: ['wood', 'stone', 'food'],
    } as const;
    let nonEmpty = 0;
    for (let i = 0; i < 2000; i++) {
      for (const biome of ['TROPICAL', 'TEMPERATE', 'VOLCANIC'] as const) {
        const deposit = depositFor(biome, hashCell(1, i, 0));
        const keys = Object.keys(deposit);
        expect(keys.length).toBeLessThanOrEqual(2);
        for (const k of keys) {
          expect(foreignOf[biome]).toContain(k);
          const amount = deposit[k as keyof typeof deposit]!;
          expect(Number.isInteger(amount)).toBe(true);
          expect(amount).toBeGreaterThanOrEqual(200);
          expect(amount).toBeLessThanOrEqual(999);
        }
        if (keys.length > 0) nonEmpty++;
      }
    }
    // DEPOSIT_CHANCE = 0.3: około 30 % wysp ma znalezisko
    expect(nonEmpty / 6000).toBeGreaterThan(0.25);
    expect(nonEmpty / 6000).toBeLessThan(0.35);
  });
});
```

- [ ] **Step 2: Uruchom testy i potwierdź porażkę**

Run: `npx vitest run src/domain/geography`
Expected: FAIL — brak `noise.js` i `island.js`.

- [ ] **Step 3: Stałe i szum**

`src/domain/geography/constants.ts`:

```ts
/**
 * Stałe kontraktu geografii (ADR 0001 klienta, załącznik; api-guidelines sekcja 4).
 * Zmiana którejkolwiek zmienia geografię każdego otwartego świata — to migracja świata, nie redeploy.
 * Test parity porównuje je z blokiem `constants` w contract/world-parity.json.
 */
export const LAND_FREQUENCY = 0.12;
export const LAND_THRESHOLD = 0.3;
export const BIOME_FREQUENCY = 0.03;
export const BIOME_BAND = 0.15;
export const DEPOSIT_CHANCE = 0.3;
export const RADIUS_MIN = 60.0;
export const RADIUS_MAX = 110.0;
export const OCTAVE_SALT = 1013;
/** Kolejność iteracji przy losowaniu znaleziska — część kontraktu (ResourceTypes.ALL u klienta). */
export const RESOURCE_ORDER = ['wood', 'stone', 'food', 'iron', 'sulfur'] as const;
export type ResourceName = (typeof RESOURCE_ORDER)[number];
```

`src/domain/geography/noise.ts`:

```ts
import { hash01, hashCell } from './hash.js';
import { OCTAVE_SALT } from './constants.js';

/** Wartość siatki w punkcie całkowitym, w [-1, 1). */
export function lattice(seed: number, ix: number, iy: number): number {
  return hash01(hashCell(seed, ix, iy)) * 2.0 - 1.0;
}

export function smooth(t: number): number {
  return t * t * (3.0 - 2.0 * t);
}

/** Dwuwymiarowy szum wartościowy: bilinearna interpolacja rogów wygładzona `smooth`. Math.floor, nigdy trunc. */
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const u = smooth(fx);
  const v = smooth(fy);
  const n00 = lattice(seed, ix, iy);
  const n10 = lattice(seed, ix + 1, iy);
  const n01 = lattice(seed, ix, iy + 1);
  const n11 = lattice(seed, ix + 1, iy + 1);
  const a = n00 + (n10 - n00) * u;
  const b = n01 + (n11 - n01) * u;
  return a + (b - a) * v;
}

/** Fraktalna suma oktaw. Kolejność działań jest kontraktem: inna kolejność zmienia ostatnie bity. */
export function fbm(seed: number, x: number, y: number, octaves: number): number {
  let total = 0.0;
  let norm = 0.0;
  let amp = 1.0;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    total += amp * valueNoise(seed + i * OCTAVE_SALT, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return total / norm;
}
```

- [ ] **Step 4: Wyspa i znalezisko**

`src/domain/geography/island.ts`:

```ts
import {
  BIOME_BAND,
  BIOME_FREQUENCY,
  DEPOSIT_CHANCE,
  LAND_FREQUENCY,
  LAND_THRESHOLD,
  RADIUS_MAX,
  RADIUS_MIN,
  RESOURCE_ORDER,
  type ResourceName,
} from './constants.js';
import { hash01, hashCell } from './hash.js';
import { fbm } from './noise.js';

export type Biome = 'TROPICAL' | 'TEMPERATE' | 'VOLCANIC';
export type Deposit = Partial<Record<ResourceName, number>>;

export interface Island {
  x: number;
  y: number;
  /** hashCell(seed, x, y) — u klienta `Island.seed_val`. */
  hash: number;
  biome: Biome;
  radius: number;
  /** Pusty obiekt = brak znaleziska. */
  deposit: Deposit;
}

/** Zasoby produkowane przez biom — lokalna kopia kontraktu (ADR 0002), sprawdzana testem z domain/rules. */
const BIOME_RESOURCES: Record<Biome, readonly ResourceName[]> = {
  TROPICAL: ['wood', 'food'],
  TEMPERATE: ['stone', 'food'],
  VOLCANIC: ['iron', 'sulfur'],
};

export function landValue(seed: number, x: number, y: number): number {
  return fbm(seed, x * LAND_FREQUENCY, y * LAND_FREQUENCY, 2);
}

export function biomeValue(seed: number, x: number, y: number): number {
  return fbm(seed + 1, x * BIOME_FREQUENCY, y * BIOME_FREQUENCY, 1);
}

export function biomeFromValue(b: number): Biome {
  if (b < -BIOME_BAND) return 'TROPICAL';
  if (b > BIOME_BAND) return 'VOLCANIC';
  return 'TEMPERATE';
}

/** `WorldGrid._deposit_for`: 1–2 zasoby SPOZA biomu wyspy, ilości całkowite w [200, 999]. */
export function depositFor(biome: Biome, h: number): Deposit {
  const h2 = hashCell(h, 7, 11);
  if (hash01(h2) >= DEPOSIT_CHANCE) return {};
  const foreign = RESOURCE_ORDER.filter((r) => !BIOME_RESOURCES[biome].includes(r));
  const h3 = hashCell(h2, 3, 5);
  const count = 1 + Math.trunc(hash01(h3) * 2.0);
  const start = Math.trunc(hash01(hashCell(h3, 1, 1)) * foreign.length);
  const out: Deposit = {};
  for (let i = 0; i < count; i++) {
    const r = foreign[(start + i) % foreign.length];
    const h4 = hashCell(h3, i + 1, 0);
    out[r] = 200 + Math.trunc(hash01(h4) * 800.0);
  }
  return out;
}

/** `WorldGrid.island_at`: null dla morza. */
export function islandAt(seed: number, x: number, y: number): Island | null {
  if (landValue(seed, x, y) <= LAND_THRESHOLD) return null;
  const hash = hashCell(seed, x, y);
  const biome = biomeFromValue(biomeValue(seed, x, y));
  return {
    x,
    y,
    hash,
    biome,
    radius: RADIUS_MIN + (RADIUS_MAX - RADIUS_MIN) * hash01(hash),
    deposit: depositFor(biome, hash),
  };
}
```

`src/domain/geography/index.ts`:

```ts
export * from './constants.js';
export * from './hash.js';
export * from './noise.js';
export * from './island.js';
```

- [ ] **Step 5: Uruchom testy i potwierdź sukces**

Run: `npx vitest run src/domain/geography`
Expected: PASS — wszystkie testy `hash`, `noise`, `island`. Jeśli złoty wiersz `land`/`biome` się nie zgadza, **nie poprawiaj oczekiwań** — porównaj implementację linia po linii z `../islanders/scripts/core/WorldGrid.gd`.

- [ ] **Step 6: Commit**

```bash
npm run lint && git add src/domain/geography && git commit -m "Add value noise, fbm, island placement and deposit rules from the client contract"
```

---

## Task 7: Test zgodności z `contract/world-parity.json`

**Files:**
- Create: `src/domain/geography/world-parity.spec.ts`

**Interfaces:**
- Consumes: wszystko z Task 5–6.

- [ ] **Step 1: Napisz test parity**

`src/domain/geography/world-parity.spec.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  BIOME_BAND,
  BIOME_FREQUENCY,
  DEPOSIT_CHANCE,
  LAND_FREQUENCY,
  LAND_THRESHOLD,
  RADIUS_MAX,
  RADIUS_MIN,
  RESOURCE_ORDER,
} from './constants.js';
import { hashCell } from './hash.js';
import { biomeValue, islandAt, landValue, type Deposit } from './island.js';

interface ParityCell {
  x: number;
  y: number;
  hash: number;
  land: number;
  biome: number;
  isIsland: boolean;
  biomeType?: string;
  radius?: number;
  deposit?: Deposit;
}

interface ParityFile {
  gridSize: number;
  constants: {
    landFrequency: number;
    biomeFrequency: number;
    biomeBand: number;
    landThreshold: number;
    radiusMin: number;
    radiusMax: number;
    depositChance: number;
    resourceOrder: string[];
  };
  worlds: { seed: number; cells: ParityCell[] }[];
}

const clientDir = process.env.ISLANDERS_CLIENT_DIR ?? '../islanders';
const parityPath = path.resolve(process.cwd(), clientDir, 'contract', 'world-parity.json');

function loadParity(): ParityFile {
  if (!existsSync(parityPath)) {
    throw new Error(
      `Brak pliku kontraktu ${parityPath}. Sklonuj repozytorium klienta obok backendu albo ustaw ISLANDERS_CLIENT_DIR. Ten test nie może być pomijany.`,
    );
  }
  return JSON.parse(readFileSync(parityPath, 'utf8')) as ParityFile;
}

describe('zgodność geografii z klientem (contract/world-parity.json)', () => {
  const parity = loadParity();

  it('stałe kontraktu są identyczne', () => {
    expect(parity.constants.landFrequency).toBe(LAND_FREQUENCY);
    expect(parity.constants.biomeFrequency).toBe(BIOME_FREQUENCY);
    expect(parity.constants.biomeBand).toBe(BIOME_BAND);
    expect(parity.constants.landThreshold).toBe(LAND_THRESHOLD);
    expect(parity.constants.radiusMin).toBe(RADIUS_MIN);
    expect(parity.constants.radiusMax).toBe(RADIUS_MAX);
    expect(parity.constants.depositChance).toBe(DEPOSIT_CHANCE);
    expect(parity.constants.resourceOrder).toEqual([...RESOURCE_ORDER]);
  });

  it('plik pokrywa co najmniej 2 światy po gridSize² komórek', () => {
    expect(parity.worlds.length).toBeGreaterThanOrEqual(2);
    for (const w of parity.worlds) {
      expect(w.cells).toHaveLength(parity.gridSize * parity.gridSize);
    }
  });

  for (const world of parity.worlds) {
    it(`seed ${world.seed}: każda komórka zgadza się dokładnie (bez tolerancji)`, () => {
      const mismatches: string[] = [];
      for (const cell of world.cells) {
        const { x, y } = cell;
        const hash = hashCell(world.seed, x, y);
        const land = landValue(world.seed, x, y);
        const biome = biomeValue(world.seed, x, y);
        const island = islandAt(world.seed, x, y);

        if (hash !== cell.hash) mismatches.push(`(${x},${y}) hash ${hash} != ${cell.hash}`);
        if (land !== cell.land) mismatches.push(`(${x},${y}) land ${land} != ${cell.land}`);
        if (biome !== cell.biome) mismatches.push(`(${x},${y}) biome ${biome} != ${cell.biome}`);
        if ((island !== null) !== cell.isIsland) {
          mismatches.push(`(${x},${y}) isIsland ${island !== null} != ${cell.isIsland}`);
          continue;
        }
        if (island) {
          if (island.biome !== cell.biomeType)
            mismatches.push(`(${x},${y}) biomeType ${island.biome} != ${cell.biomeType}`);
          if (island.radius !== cell.radius)
            mismatches.push(`(${x},${y}) radius ${island.radius} != ${cell.radius}`);
          const expectedDeposit = cell.deposit ?? {};
          const keys = new Set([...Object.keys(island.deposit), ...Object.keys(expectedDeposit)]);
          for (const k of keys) {
            const got = island.deposit[k as keyof Deposit];
            const want = expectedDeposit[k as keyof Deposit];
            if (got !== want) mismatches.push(`(${x},${y}) deposit.${k} ${got} != ${want}`);
          }
        }
        if (mismatches.length >= 20) break;
      }
      expect(mismatches, `pierwsze rozbieżności:\n${mismatches.join('\n')}`).toEqual([]);
    }, 60_000);
  }
});
```

- [ ] **Step 2: Uruchom test**

Run: `npx vitest run src/domain/geography/world-parity.spec.ts`
Expected: PASS — 2 światy (1337, 99999) po 40 000 komórek, czas rzędu kilku sekund. Wklej wyjście do notatki z zadania.

Jeśli test pada: **nie zmieniaj oczekiwań i nie dodawaj tolerancji.** Porównaj `hash.ts`, `noise.ts` i `island.ts` z `../islanders/scripts/core/WorldGrid.gd`. Typowe przyczyny: `Math.trunc` zamiast `Math.floor` w `valueNoise`, zmieniona kolejność działań w `fbm`, `number` zamiast `BigInt` w `hashCell`, zła kolejność `RESOURCE_ORDER`.

- [ ] **Step 3: Sprawdź, że brak pliku to porażka, nie pominięcie**

Run: `ISLANDERS_CLIENT_DIR=/nie/istnieje npx vitest run src/domain/geography/world-parity.spec.ts`
Expected: FAIL z komunikatem `Brak pliku kontraktu ... Ten test nie może być pomijany.`

- [ ] **Step 4: Commit**

```bash
npm run lint && git add src/domain/geography/world-parity.spec.ts && git commit -m "Add exact-equality geography parity test against the client contract file"
```

---

## Task 8: Reguły domenowe (`domain/rules`) i test zgodności enumów bazy

**Files:**
- Create: `src/domain/rules/resources.ts`, `src/domain/rules/biomes.ts`, `src/domain/rules/buildings.ts`, `src/domain/rules/rules.spec.ts`, `src/infra/db/schema/enums.spec.ts`
- Modify: `src/domain/rules/index.ts`

**Interfaces:**
- Produces: `RESOURCES`, `Resource`, `Resources`, `emptyResources()`, `isResource(k)`; `BIOMES`, `Biome`, `biomeResources(b): readonly [Resource, Resource]`; `BUILDINGS`, `Building`, `COMMON_BUILDINGS`, `EXTRACTION_BUILDINGS`, `ExtractionBuilding`, `BuildingLevels = Partial<Record<Building, number>>`, `extractionBuildings(b): readonly [ExtractionBuilding, ExtractionBuilding]`, `slotsFor(b): Building[]`, `buildingExtracts(t): Resource | null`, `isExtractionBuilding(t)`.

- [ ] **Step 1: Napisz testy**

`src/domain/rules/rules.spec.ts`:

```ts
import { RESOURCE_ORDER } from '../geography/constants.js';
import {
  BIOMES,
  BUILDINGS,
  COMMON_BUILDINGS,
  RESOURCES,
  biomeResources,
  buildingExtracts,
  emptyResources,
  extractionBuildings,
  slotsFor,
} from './index.js';

describe('reguły domenowe (CONTEXT.md, ADR 0002)', () => {
  it('RESOURCES ma kolejność kontraktu geografii', () => {
    expect([...RESOURCES]).toEqual([...RESOURCE_ORDER]);
  });

  it('każdy biom produkuje dokładnie dwa zasoby i dopuszcza dokładnie dwa budynki wydobywcze', () => {
    for (const b of BIOMES) {
      expect(biomeResources(b)).toHaveLength(2);
      expect(extractionBuildings(b)).toHaveLength(2);
      for (const t of extractionBuildings(b)) {
        expect(biomeResources(b)).toContain(buildingExtracts(t));
      }
    }
  });

  it('mapowanie biomów z ADR 0002', () => {
    expect(biomeResources('TROPICAL')).toEqual(['wood', 'food']);
    expect(biomeResources('TEMPERATE')).toEqual(['stone', 'food']);
    expect(biomeResources('VOLCANIC')).toEqual(['iron', 'sulfur']);
    expect(extractionBuildings('TROPICAL')).toEqual(['SAWMILL', 'FARM']);
    expect(extractionBuildings('TEMPERATE')).toEqual(['QUARRY', 'FARM']);
    expect(extractionBuildings('VOLCANIC')).toEqual(['IRON_MINE', 'SULFUR_PIT']);
  });

  it('sześć slotów: cztery wspólne plus dwa wydobywcze, w stałej kolejności', () => {
    expect(slotsFor('VOLCANIC')).toEqual([...COMMON_BUILDINGS, 'IRON_MINE', 'SULFUR_PIT']);
    for (const b of BIOMES) expect(slotsFor(b)).toHaveLength(6);
  });

  it('budynki wspólne nic nie wydobywają', () => {
    for (const t of COMMON_BUILDINGS) expect(buildingExtracts(t)).toBeNull();
    expect(BUILDINGS).toHaveLength(9);
  });

  it('emptyResources ma pięć zer', () => {
    expect(emptyResources()).toEqual({ wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0 });
  });
});
```

`src/infra/db/schema/enums.spec.ts`:

```ts
import { BIOMES, BUILDINGS } from '../../../domain/rules/index.js';
import { biomeType, buildingType, missionType, worldStatus } from './enums.js';

describe('enumy Postgresa odpowiadają regułom domenowym', () => {
  it('biome_type i building_type', () => {
    expect(biomeType.enumValues).toEqual([...BIOMES]);
    expect(buildingType.enumValues).toEqual([...BUILDINGS]);
  });
  it('world_status i mission_type ze słownika', () => {
    expect(worldStatus.enumValues).toEqual(['OPEN', 'CLOSED', 'ENDED']);
    expect(missionType.enumValues).toEqual(['COLONIZE', 'ATTACK', 'TRANSPORT', 'EXPEDITION', 'RETURN']);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/domain/rules src/infra/db/schema/enums.spec.ts`
Expected: FAIL — brak eksportów w `rules/index.js`.

- [ ] **Step 3: Zaimplementuj**

`src/domain/rules/resources.ts`:

```ts
export const RESOURCES = ['wood', 'stone', 'food', 'iron', 'sulfur'] as const;
export type Resource = (typeof RESOURCES)[number];
export type Resources = Record<Resource, number>;

export function isResource(key: string): key is Resource {
  return (RESOURCES as readonly string[]).includes(key);
}

export function emptyResources(): Resources {
  return { wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0 };
}
```

`src/domain/rules/biomes.ts`:

```ts
import type { Resource } from './resources.js';

export const BIOMES = ['TROPICAL', 'TEMPERATE', 'VOLCANIC'] as const;
export type Biome = (typeof BIOMES)[number];

/** ADR 0002: każdy biom produkuje dokładnie dwa zasoby. */
const BIOME_RESOURCES: Record<Biome, readonly [Resource, Resource]> = {
  TROPICAL: ['wood', 'food'],
  TEMPERATE: ['stone', 'food'],
  VOLCANIC: ['iron', 'sulfur'],
};

export function biomeResources(biome: Biome): readonly [Resource, Resource] {
  return BIOME_RESOURCES[biome];
}
```

`src/domain/rules/buildings.ts`:

```ts
import type { Biome } from './biomes.js';
import type { Resource } from './resources.js';

export const COMMON_BUILDINGS = ['TOWN_HALL', 'BARRACKS', 'SHIPYARD', 'WAREHOUSE'] as const;
export const EXTRACTION_BUILDINGS = ['SAWMILL', 'QUARRY', 'FARM', 'IRON_MINE', 'SULFUR_PIT'] as const;
export const BUILDINGS = [...COMMON_BUILDINGS, ...EXTRACTION_BUILDINGS] as const;

export type CommonBuilding = (typeof COMMON_BUILDINGS)[number];
export type ExtractionBuilding = (typeof EXTRACTION_BUILDINGS)[number];
export type Building = (typeof BUILDINGS)[number];
/** Poziomy budynków osady; brak klucza = poziom 0. */
export type BuildingLevels = Partial<Record<Building, number>>;

const EXTRACTS: Record<ExtractionBuilding, Resource> = {
  SAWMILL: 'wood',
  QUARRY: 'stone',
  FARM: 'food',
  IRON_MINE: 'iron',
  SULFUR_PIT: 'sulfur',
};

const BIOME_EXTRACTION: Record<Biome, readonly [ExtractionBuilding, ExtractionBuilding]> = {
  TROPICAL: ['SAWMILL', 'FARM'],
  TEMPERATE: ['QUARRY', 'FARM'],
  VOLCANIC: ['IRON_MINE', 'SULFUR_PIT'],
};

export function isExtractionBuilding(t: Building): t is ExtractionBuilding {
  return t in EXTRACTS;
}

export function buildingExtracts(t: Building): Resource | null {
  return isExtractionBuilding(t) ? EXTRACTS[t] : null;
}

export function extractionBuildings(biome: Biome): readonly [ExtractionBuilding, ExtractionBuilding] {
  return BIOME_EXTRACTION[biome];
}

/** Sześć slotów osady: cztery wspólne plus dwa wydobywcze biomu, w stałej kolejności. */
export function slotsFor(biome: Biome): Building[] {
  return [...COMMON_BUILDINGS, ...BIOME_EXTRACTION[biome]];
}
```

`src/domain/rules/index.ts`:

```ts
export * from './resources.js';
export * from './biomes.js';
export * from './buildings.js';
```

- [ ] **Step 4: Uruchom i potwierdź sukces**

Run: `npx vitest run src/domain/rules src/infra/db/schema/enums.spec.ts`
Expected: PASS, 8 testów.

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/domain/rules src/infra/db/schema/enums.spec.ts && git commit -m "Add domain rules for resources, biomes and building slots"
```

---

## Task 9: Balans startowy (`domain/balance`)

**Files:**
- Create: `src/domain/balance/balance.ts`, `src/domain/balance/balance.spec.ts`
- Modify: `src/domain/balance/index.ts`

**Interfaces:**
- Consumes: `Biome`, `Building`, `BuildingLevels`, `Resources`, `emptyResources`, `slotsFor`, `extractionBuildings`, `buildingExtracts`, `EXTRACTION_BUILDINGS`, `ExtractionBuilding` (Task 8).
- Produces: `STARTER_PACK: Resources`, `BASE_RATE: Record<ExtractionBuilding, number>`, `startingBuildings(biome): Record<Building, number>` (tylko sloty biomu), `productionPerHour(biome, levels): Resources`, `capacityFor(levels): number`, `populationMaxFor(levels): number`.

- [ ] **Step 1: Napisz testy**

`src/domain/balance/balance.spec.ts`:

```ts
import {
  BASE_RATE,
  STARTER_PACK,
  capacityFor,
  populationMaxFor,
  productionPerHour,
  startingBuildings,
} from './balance.js';

describe('balans — wartości robocze (spec A 6.2)', () => {
  it('stan startowy: ratusz 1, magazyn 1, wydobywcze 1, koszary i stocznia 0, dokładnie sześć slotów', () => {
    expect(startingBuildings('TROPICAL')).toEqual({
      TOWN_HALL: 1,
      BARRACKS: 0,
      SHIPYARD: 0,
      WAREHOUSE: 1,
      SAWMILL: 1,
      FARM: 1,
    });
    expect(Object.keys(startingBuildings('VOLCANIC'))).toHaveLength(6);
  });

  it('pakiet startowy', () => {
    expect(STARTER_PACK).toEqual({ wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 });
  });

  it('produkcja = BASE_RATE * poziom, zasób spoza biomu zawsze 0', () => {
    expect(productionPerHour('TROPICAL', { SAWMILL: 2, FARM: 1 })).toEqual({
      wood: 2 * BASE_RATE.SAWMILL,
      stone: 0,
      food: BASE_RATE.FARM,
      iron: 0,
      sulfur: 0,
    });
    // poziom budynku spoza biomu (nie powinien istnieć) nie daje produkcji
    expect(productionPerHour('VOLCANIC', { SAWMILL: 3, IRON_MINE: 1 }).wood).toBe(0);
    expect(productionPerHour('VOLCANIC', { SAWMILL: 3, IRON_MINE: 1 }).iron).toBe(BASE_RATE.IRON_MINE);
    expect(productionPerHour('TEMPERATE', {})).toEqual({ wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0 });
  });

  it('pojemność 500 + 1500 * WAREHOUSE', () => {
    expect(capacityFor({})).toBe(500);
    expect(capacityFor({ WAREHOUSE: 1 })).toBe(2000);
    expect(capacityFor({ WAREHOUSE: 3 })).toBe(5000);
  });

  it('limit populacji 100 * TOWN_HALL', () => {
    expect(populationMaxFor({})).toBe(0);
    expect(populationMaxFor({ TOWN_HALL: 1 })).toBe(100);
    expect(populationMaxFor({ TOWN_HALL: 2 })).toBe(200);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/domain/balance`
Expected: FAIL — brak `balance.js`.

- [ ] **Step 3: Zaimplementuj**

`src/domain/balance/balance.ts`:

```ts
import {
  type Biome,
  type Building,
  type BuildingLevels,
  type ExtractionBuilding,
  type Resources,
  buildingExtracts,
  emptyResources,
  extractionBuildings,
  slotsFor,
} from '../rules/index.js';

/**
 * WARTOŚCI ROBOCZE. Spec B kalibruje je i dopisuje koszty oraz czasy, nie zmieniając sygnatur.
 * Jedyne miejsce w kodzie, gdzie wolno trzymać liczby balansu.
 */

export const STARTER_PACK: Resources = { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 };

/** Produkcja na godzinę na poziom budynku wydobywczego. */
export const BASE_RATE: Record<ExtractionBuilding, number> = {
  SAWMILL: 60,
  QUARRY: 50,
  FARM: 80,
  IRON_MINE: 30,
  SULFUR_PIT: 20,
};

const STARTING_LEVELS: Partial<Record<Building, number>> = { TOWN_HALL: 1, WAREHOUSE: 1 };

/** Sześć slotów biomu z poziomami startowymi: ratusz 1, magazyn 1, oba wydobywcze 1, reszta 0. */
export function startingBuildings(biome: Biome): Record<Building, number> {
  const extraction = extractionBuildings(biome);
  const out = {} as Record<Building, number>;
  for (const slot of slotsFor(biome)) {
    out[slot] = STARTING_LEVELS[slot] ?? ((extraction as readonly Building[]).includes(slot) ? 1 : 0);
  }
  return out;
}

/** Zasób spoza biomu ma zawsze 0, nawet gdyby w `levels` pojawił się obcy budynek. */
export function productionPerHour(biome: Biome, levels: BuildingLevels): Resources {
  const out = emptyResources();
  for (const building of extractionBuildings(biome)) {
    const resource = buildingExtracts(building);
    if (resource) out[resource] = BASE_RATE[building] * (levels[building] ?? 0);
  }
  return out;
}

export function capacityFor(levels: BuildingLevels): number {
  return 500 + 1500 * (levels.WAREHOUSE ?? 0);
}

export function populationMaxFor(levels: BuildingLevels): number {
  return 100 * (levels.TOWN_HALL ?? 0);
}
```

`src/domain/balance/index.ts`:

```ts
export * from './balance.js';
```

- [ ] **Step 4: Uruchom i potwierdź sukces**

Run: `npx vitest run src/domain/balance`
Expected: PASS, 5 testów.

- [ ] **Step 5: Commit**

```bash
npm run lint && git add src/domain/balance && git commit -m "Add placeholder balance: starter pack, production, capacity and population limits"
```

---

## Task 10: Leniwe zasoby (`domain/economy`) i zegar (`domain/time`, `TimeModule`)

**Files:**
- Create: `src/domain/economy/current-resources.ts`, `src/domain/economy/current-resources.spec.ts`, `src/domain/time/clock.ts`, `src/infra/time/time.module.ts`
- Modify: `src/domain/economy/index.ts`, `src/domain/time/index.ts`, `src/app.module.ts`, `test/support/test-app.ts`

**Interfaces:**
- Produces: `currentResources(stored: Resources, ratePerHour: Resources, lastSyncAt: Date, now: Date, capacity: number): Resources`; `interface Clock { now(): Date }`, `systemClock`, `class FixedClock implements Clock { constructor(at: Date); set(at: Date); advance(ms: number) }`; token `CLOCK`, `TimeModule`; `createTestApp({ clock })` przyjmuje zegar.

- [ ] **Step 1: Napisz testy**

`src/domain/economy/current-resources.spec.ts`:

```ts
import { currentResources } from './current-resources.js';

const stored = { wood: 100, stone: 50, food: 1000, iron: 0, sulfur: 0 };
const rate = { wood: 60, stone: 0, food: 80, iron: 0, sulfur: 0 };
const t0 = new Date('2026-09-08T12:00:00.000Z');

describe('currentResources — ta sama formuła co Settlement.current_resources u klienta', () => {
  it('0 h: bez zmian', () => {
    expect(currentResources(stored, rate, t0, t0, 8000)).toEqual(stored);
  });

  it('2 h: stored + rate * 2', () => {
    const now = new Date(t0.getTime() + 2 * 3600_000);
    expect(currentResources(stored, rate, t0, now, 8000)).toEqual({
      wood: 220,
      stone: 50,
      food: 1160,
      iron: 0,
      sulfur: 0,
    });
  });

  it('obcina do pojemności osobno dla każdego zasobu', () => {
    const now = new Date(t0.getTime() + 100 * 3600_000);
    const out = currentResources(stored, rate, t0, now, 2000);
    expect(out.wood).toBe(2000);
    expect(out.food).toBe(2000);
    expect(out.stone).toBe(50);
  });

  it('ujemna delta czasu nie cofa zasobów', () => {
    const earlier = new Date(t0.getTime() - 3600_000);
    expect(currentResources(stored, rate, t0, earlier, 8000)).toEqual(stored);
  });

  it('ułamki godzin i brak produkcji', () => {
    const now = new Date(t0.getTime() + 30 * 60_000);
    expect(currentResources(stored, rate, t0, now, 8000).wood).toBe(130);
    expect(currentResources(stored, { ...rate, wood: 0 }, t0, now, 8000).wood).toBe(100);
  });

  it('nie schodzi poniżej zera przy ujemnym stanie', () => {
    expect(currentResources({ ...stored, iron: -5 }, rate, t0, t0, 8000).iron).toBe(0);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/domain/economy`
Expected: FAIL — brak modułu.

- [ ] **Step 3: Zaimplementuj ekonomię i zegar**

`src/domain/economy/current-resources.ts`:

```ts
import { RESOURCES, type Resources, emptyResources } from '../rules/index.js';

/**
 * Leniwa ewaluacja: clamp(stored + rate * hours, 0, capacity) dla każdego zasobu.
 * Identyczna z `Settlement.current_resources(now)` klienta; `now` zawsze jako argument.
 */
export function currentResources(
  stored: Resources,
  ratePerHour: Resources,
  lastSyncAt: Date,
  now: Date,
  capacity: number,
): Resources {
  const hours = Math.max(now.getTime() - lastSyncAt.getTime(), 0) / 3_600_000;
  const out = emptyResources();
  for (const r of RESOURCES) {
    const value = stored[r] + ratePerHour[r] * hours;
    out[r] = Math.min(Math.max(value, 0), capacity);
  }
  return out;
}
```

`src/domain/economy/index.ts`: `export * from './current-resources.js';`

`src/domain/time/clock.ts`:

```ts
/** Jedyne źródło czasu w aplikacji. Produkcja: systemClock; testy: FixedClock. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

export class FixedClock implements Clock {
  constructor(private at: Date) {}

  now(): Date {
    return new Date(this.at.getTime());
  }

  set(at: Date): void {
    this.at = new Date(at.getTime());
  }

  advance(ms: number): void {
    this.at = new Date(this.at.getTime() + ms);
  }
}
```

`src/domain/time/index.ts`: `export * from './clock.js';`

`src/infra/time/time.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { systemClock } from '../../domain/time/index.js';

export const CLOCK = Symbol('CLOCK');

@Global()
@Module({
  providers: [{ provide: CLOCK, useValue: systemClock }],
  exports: [CLOCK],
})
export class TimeModule {}
```

Dodaj `TimeModule` do `imports` w `AppModule.forRoot` po `DbModule`.

- [ ] **Step 4: Zegar w harnessie e2e**

W `test/support/test-app.ts` zmień sygnaturę i budowę modułu:

```ts
import type { Clock } from '../../src/domain/time/index.js';
import { CLOCK } from '../../src/infra/time/time.module.js';

export interface CreateTestAppOptions {
  env?: TestEnvOverrides;
  clock?: Clock;
}

export async function createTestApp(options: CreateTestAppOptions = {}): Promise<INestApplication> {
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
```

Zaktualizuj wywołania w `test/health.e2e-spec.ts`: `createTestApp({ env: { SWAGGER_ENABLED: 'true' } })` i `createTestApp({ env: { SWAGGER_ENABLED: 'false' } })`.

- [ ] **Step 5: Uruchom testy**

Run: `npm test && npm run test:e2e`
Expected: PASS w obu zestawach.

- [ ] **Step 6: Commit**

```bash
npm run lint && git add -A && git commit -m "Add lazy resource evaluation and injectable clock"
```

---

## Task 11: Konta i JWT — rejestracja, logowanie, rotacja refresh tokenu z oknem łaski, logout

**Files:**
- Create: `src/modules/players/players.repository.ts`, `src/modules/auth/tokens.ts`, `src/modules/auth/refresh-tokens.repository.ts`, `src/modules/auth/auth.dto.ts`, `src/modules/auth/auth.service.ts`, `src/modules/auth/auth.controller.ts`, `src/modules/auth/jwt-auth.guard.ts`, `src/modules/auth/public.decorator.ts`, `src/modules/auth/current-player.decorator.ts`, `test/support/fixtures.ts`, `test/auth.e2e-spec.ts`
- Modify: `src/modules/players/players.module.ts`, `src/modules/auth/auth.module.ts`, `src/modules/health/health.controller.ts` (dodać `@Public()`)

**Interfaces:**
- Consumes: `DB`, `Db`, `DbClient`, `players`, `refreshTokens`, `isUniqueViolation` (Task 4); `ENV`, `Env` (Task 1); `CLOCK`, `Clock` (Task 10).
- Produces: `PlayersRepository { create(input): Promise<PlayerRow>; findByEmail(email): Promise<PlayerRow | undefined>; findById(id): Promise<PlayerRow | undefined> }`, `type PlayerRow = typeof players.$inferSelect`; `AuthService { register, login, refresh, logout }`; `AuthResult = { playerId: number; nickname: string; accessToken: string; refreshToken: string }`; `JwtAuthGuard` (globalny), `@Public()`, `@CurrentPlayer()`, `interface AuthenticatedRequest extends Request { playerId: number }`; fixtures `registerPlayer(app, overrides?)`, `bearer(token)`, `uniqueSuffix()`.

- [ ] **Step 1: Napisz fixtures i test e2e auth**

`test/support/fixtures.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export interface RegisteredPlayer {
  playerId: number;
  nickname: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Rejestruje świeże konto z unikalnym e-mailem i pseudonimem. */
export async function registerPlayer(
  app: INestApplication,
  overrides: Partial<{ email: string; nickname: string; password: string }> = {},
): Promise<RegisteredPlayer> {
  const suffix = uniqueSuffix();
  const body = {
    email: overrides.email ?? `p-${suffix}@test.local`,
    nickname: overrides.nickname ?? `p_${suffix}`,
    password: overrides.password ?? 'haslo-testowe-123',
  };
  const res = await request(app.getHttpServer()).post('/api/v1/auth/register').send(body).expect(201);
  return { ...res.body, email: body.email, password: body.password };
}
```

`test/auth.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { registerPlayer, uniqueSuffix } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('auth (e2e)', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('register zwraca 201 z playerId, nickname i parą tokenów', async () => {
    const p = await registerPlayer(app);
    expect(p.playerId).toEqual(expect.any(Number));
    expect(p.nickname).toMatch(/^p_/);
    expect(p.accessToken.split('.')).toHaveLength(3);
    expect(p.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('waliduje ciało: zły e-mail, krótkie hasło, zły pseudonim, nieznane pole', async () => {
    await http().post('/api/v1/auth/register').send({ email: 'nie-email', nickname: 'ok_nick', password: 'haslo-testowe-123' }).expect(400);
    await http().post('/api/v1/auth/register').send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'ok_nick', password: 'krotkie' }).expect(400);
    await http().post('/api/v1/auth/register').send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'zł y', password: 'haslo-testowe-123' }).expect(400);
    await http().post('/api/v1/auth/register').send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'ok_nick2', password: 'haslo-testowe-123', admin: true }).expect(400);
  });

  it('zajęty e-mail (inną wielkością liter) -> 409 z field=email', async () => {
    const p = await registerPlayer(app);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: p.email.toUpperCase(), nickname: `x_${uniqueSuffix()}`, password: 'haslo-testowe-123' })
      .expect(409);
    expect(res.body.field).toBe('email');
  });

  it('zajęty pseudonim (inną wielkością liter) -> 409 z field=nickname', async () => {
    const p = await registerPlayer(app);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email: `y-${uniqueSuffix()}@t.pl`, nickname: p.nickname.toUpperCase(), password: 'haslo-testowe-123' })
      .expect(409);
    expect(res.body.field).toBe('nickname');
  });

  it('login: poprawne dane -> 200, złe hasło i nieistniejące konto -> 401 o tej samej treści', async () => {
    const p = await registerPlayer(app);
    const ok = await http().post('/api/v1/auth/login').send({ email: p.email, password: p.password }).expect(200);
    expect(ok.body.playerId).toBe(p.playerId);
    expect(ok.body.nickname).toBe(p.nickname);
    const bad = await http().post('/api/v1/auth/login').send({ email: p.email, password: 'zle-haslo-123' }).expect(401);
    const missing = await http().post('/api/v1/auth/login').send({ email: `nikt-${uniqueSuffix()}@t.pl`, password: 'x' }).expect(401);
    expect(bad.body.message).toBe(missing.body.message);
  });

  it('refresh rotuje token; stary działa w oknie łaski 60 s, po nim 401 bez wylogowania innych', async () => {
    const p = await registerPlayer(app);
    const first = await http().post('/api/v1/auth/refresh').send({ refreshToken: p.refreshToken }).expect(200);
    expect(first.body.refreshToken).not.toBe(p.refreshToken);
    expect(first.body.accessToken.split('.')).toHaveLength(3);

    clock.advance(30_000);
    const inGrace = await http().post('/api/v1/auth/refresh').send({ refreshToken: p.refreshToken }).expect(200);
    expect(inGrace.body.refreshToken).not.toBe(first.body.refreshToken);

    clock.advance(31_000);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: p.refreshToken }).expect(401);

    // tokeny wydane wcześniej nadal działają — nie ma masowego wylogowania
    await http().post('/api/v1/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(200);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: inGrace.body.refreshToken }).expect(200);
  });

  it('refresh po wygaśnięciu -> 401', async () => {
    const p = await registerPlayer(app);
    clock.advance(31 * 24 * 3600_000);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: p.refreshToken }).expect(401);
    clock.advance(-31 * 24 * 3600_000);
  });

  it('logout unieważnia natychmiast, bez okna łaski; powtórny logout to nadal 204', async () => {
    const p = await registerPlayer(app);
    await http().post('/api/v1/auth/logout').send({ refreshToken: p.refreshToken }).expect(204);
    await http().post('/api/v1/auth/refresh').send({ refreshToken: p.refreshToken }).expect(401);
    await http().post('/api/v1/auth/logout').send({ refreshToken: p.refreshToken }).expect(204);
    await http().post('/api/v1/auth/logout').send({ refreshToken: 'nie-istnieje' }).expect(204);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npm run test:e2e -- test/auth.e2e-spec.ts`
Expected: FAIL — `POST /api/v1/auth/register` zwraca 404.

- [ ] **Step 3: Repozytorium graczy i moduł**

`src/modules/players/players.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { players } from '../../infra/db/schema/index.js';

export type PlayerRow = typeof players.$inferSelect;

@Injectable()
export class PlayersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Rzuca błąd Postgresa 23505 (players_email_unique / players_nickname_unique) przy duplikacie. */
  async create(input: { email: string; nickname: string; passwordHash: string }): Promise<PlayerRow> {
    const [row] = await this.db.insert(players).values(input).returning();
    return row;
  }

  findByEmail(email: string): Promise<PlayerRow | undefined> {
    return this.db.query.players.findFirst({ where: eq(players.email, email) });
  }

  findById(id: number): Promise<PlayerRow | undefined> {
    return this.db.query.players.findFirst({ where: eq(players.id, id) });
  }
}
```

`src/modules/players/players.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PlayersRepository } from './players.repository.js';

@Module({ providers: [PlayersRepository], exports: [PlayersRepository] })
export class PlayersModule {}
```

- [ ] **Step 4: Tokeny, repozytorium refresh tokenów, DTO**

`src/modules/auth/tokens.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

/** Zrotowany token jest akceptowany jeszcze przez 60 s, bo na telefonie odpowiedź z nową parą regularnie ginie. */
export const REFRESH_GRACE_MS = 60_000;

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** W bazie leży wyłącznie ten hasz; sam token widzi tylko klient. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

`src/modules/auth/refresh-tokens.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { refreshTokens } from '../../infra/db/schema/index.js';

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: { playerId: number; tokenHash: string; expiresAt: Date }): Promise<RefreshTokenRow> {
    const [row] = await this.db.insert(refreshTokens).values(input).returning();
    return row;
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    return this.db.query.refreshTokens.findFirst({ where: eq(refreshTokens.tokenHash, tokenHash) });
  }

  /** `replacedById` ustawione = rotacja (podlega oknu łaski); brak = logout (natychmiastowe). */
  async revoke(id: string, at: Date, replacedById: string | null): Promise<void> {
    await this.db.update(refreshTokens).set({ revokedAt: at, replacedById }).where(eq(refreshTokens.id, id));
  }
}
```

`src/modules/auth/auth.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class RegisterDto {
  @ApiProperty({ example: 'gracz@example.com' })
  @trim
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ example: 'koralowy_kapitan', description: '3–20 znaków: litery, cyfry, _ i -' })
  @trim
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,20}$/, { message: 'pseudonim: 3–20 znaków, litery, cyfry, _ i -' })
  nickname!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class LoginDto {
  @ApiProperty()
  @trim
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class AuthResultDto {
  @ApiProperty() playerId!: number;
  @ApiProperty() nickname!: string;
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
}

export class TokenPairDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
}

export class ConflictFieldDto {
  @ApiProperty({ example: 409 }) statusCode!: number;
  @ApiProperty({ example: 'E-mail jest już zajęty' }) message!: string;
  @ApiPropertyOptional({ example: 'email' }) field?: string;
}
```

- [ ] **Step 5: Serwis**

`src/modules/auth/auth.service.ts`:

```ts
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { Clock } from '../../domain/time/index.js';
import { ENV } from '../../infra/config/config.module.js';
import type { Env } from '../../infra/config/env.js';
import { isUniqueViolation } from '../../infra/db/pg-errors.js';
import { CLOCK } from '../../infra/time/time.module.js';
import { PlayersRepository, type PlayerRow } from '../players/players.repository.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import { REFRESH_GRACE_MS, generateRefreshToken, hashRefreshToken } from './tokens.js';

export interface AuthResult {
  playerId: number;
  nickname: string;
  accessToken: string;
  refreshToken: string;
}

const BAD_CREDENTIALS = 'Błędny e-mail lub hasło';

@Injectable()
export class AuthService {
  constructor(
    private readonly players: PlayersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(input: { email: string; nickname: string; password: string }): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let player: PlayerRow;
    try {
      player = await this.players.create({ email: input.email, nickname: input.nickname, passwordHash });
    } catch (err) {
      if (isUniqueViolation(err, 'players_email_unique')) {
        throw new ConflictException({ statusCode: 409, message: 'E-mail jest już zajęty', field: 'email' });
      }
      if (isUniqueViolation(err, 'players_nickname_unique')) {
        throw new ConflictException({ statusCode: 409, message: 'Pseudonim jest już zajęty', field: 'nickname' });
      }
      throw err;
    }
    const { refreshTokenId: _issued, ...result } = await this.issue(player);
    return result;
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const player = await this.players.findByEmail(input.email);
    // Jedna treść błędu dla obu przypadków, żeby nie zdradzać, czy konto istnieje.
    if (!player || !(await argon2.verify(player.passwordHash, input.password))) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    const { refreshTokenId: _issued, ...result } = await this.issue(player);
    return result;
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const now = this.clock.now();
    const row = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!row || row.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Refresh token nieważny');
    }
    if (row.revokedAt) {
      const rotated = row.replacedById !== null;
      const withinGrace = now.getTime() - row.revokedAt.getTime() <= REFRESH_GRACE_MS;
      if (!rotated || !withinGrace) {
        throw new UnauthorizedException('Refresh token unieważniony');
      }
    }
    const player = await this.players.findById(row.playerId);
    if (!player) {
      throw new UnauthorizedException('Refresh token nieważny');
    }
    const { refreshTokenId, ...result } = await this.issue(player);
    if (!row.revokedAt) {
      await this.refreshTokens.revoke(row.id, now, refreshTokenId);
    }
    return result;
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (row && !row.revokedAt) {
      await this.refreshTokens.revoke(row.id, this.clock.now(), null);
    }
  }

  private async issue(player: PlayerRow): Promise<AuthResult & { refreshTokenId: string }> {
    const now = this.clock.now();
    const accessToken = await this.jwt.signAsync({ sub: String(player.id) });
    const refreshToken = generateRefreshToken();
    const row = await this.refreshTokens.create({
      playerId: player.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.env.JWT_REFRESH_TTL * 1000),
    });
    return { playerId: player.id, nickname: player.nickname, accessToken, refreshToken, refreshTokenId: row.id };
  }
}
```

Uwaga: `issue` zwraca też `refreshTokenId` (identyfikator nowego wiersza do `replaced_by_id`), a publiczne metody go odcinają, żeby `AuthResult` w API nigdy go nie zawierał.

- [ ] **Step 6: Kontroler, strażnik, dekoratory, moduł**

`src/modules/auth/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** Wyłącza globalny JwtAuthGuard dla trasy albo całego kontrolera. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
```

`src/modules/auth/current-player.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

/** Identyfikator gracza z tokenu; dostępny wyłącznie za JwtAuthGuard. */
export const CurrentPlayer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): number => ctx.switchToHttp().getRequest<AuthenticatedRequest>().playerId,
);
```

`src/modules/auth/jwt-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC } from './public.decorator.js';

export interface AuthenticatedRequest extends Request {
  playerId: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Brak tokenu');
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice('Bearer '.length));
      req.playerId = Number(payload.sub);
    } catch {
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
    return true;
  }
}
```

`src/modules/auth/auth.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { AuthResultDto, ConflictFieldDto, LoginDto, RefreshDto, RegisterDto, TokenPairDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  @ApiCreatedResponse({ type: AuthResultDto })
  @ApiConflictResponse({ type: ConflictFieldDto })
  register(@Body() dto: RegisterDto): Promise<AuthResultDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: AuthResultDto })
  @ApiUnauthorizedResponse()
  login(@Body() dto: LoginDto): Promise<AuthResultDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOkResponse({ type: TokenPairDto })
  @ApiUnauthorizedResponse()
  async refresh(@Body() dto: RefreshDto): Promise<TokenPairDto> {
    const { accessToken, refreshToken } = await this.auth.refresh(dto.refreshToken);
    return { accessToken, refreshToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
```

`src/modules/auth/auth.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../../infra/config/config.module.js';
import type { Env } from '../../infra/config/env.js';
import { PlayersModule } from '../players/players.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

@Module({
  imports: [
    PlayersModule,
    JwtModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        secret: env.JWT_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokensRepository, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [JwtModule],
})
export class AuthModule {}
```

W `HealthController` dodaj `@Public()` nad `@Controller('health')` (import z `../auth/public.decorator.js`).

- [ ] **Step 7: Sprawdź kolumnę `replaced_by_id`**

Kolumna `replaced_by_id uuid` jest już w `src/infra/db/schema/refresh-tokens.ts` i w migracji 0001 (Task 4). Potwierdź: `grep -n replaced_by_id drizzle/0001_initial_schema.sql` zwraca jedną linię. Jeśli nie (schemat zmieniony po wygenerowaniu), uruchom `npx drizzle-kit generate --name refresh_tokens_replaced_by` i sprawdź `ALTER TABLE "refresh_tokens" ADD COLUMN "replaced_by_id" uuid;`.

- [ ] **Step 8: Uruchom e2e i potwierdź sukces**

Run: `npm run test:e2e`
Expected: PASS — `auth.e2e-spec.ts` 8 testów oraz wcześniejsze pliki. Health nadal 200 (jest `@Public()`).

- [ ] **Step 9: Commit**

```bash
npm run lint && npm run build && git add -A && git commit -m "Add registration, login, refresh rotation with grace window and logout"
```

---

## Task 12: Światy — lista, stan, `ProfileGuard`, `WorldWritableGuard`, `world:create`

**Files:**
- Create: `src/modules/worlds/worlds.repository.ts`, `src/modules/worlds/profiles.repository.ts`, `src/modules/worlds/world-views.ts`, `src/modules/worlds/profile.guard.ts`, `src/modules/worlds/world-writable.guard.ts`, `src/modules/worlds/world-writable.guard.spec.ts`, `src/modules/worlds/worlds.service.ts`, `src/modules/worlds/worlds.controller.ts`, `src/modules/worlds/worlds.dto.ts`, `src/cli/create-world.ts`, `test/worlds.e2e-spec.ts`
- Modify: `src/modules/worlds/worlds.module.ts`, `test/support/fixtures.ts`

**Interfaces:**
- Consumes: Task 4 (`DB`, tabele), Task 10 (`CLOCK`), Task 11 (`JwtAuthGuard`, `AuthenticatedRequest`, `CurrentPlayer`).
- Produces: `WorldsRepository { list(); findById(id); create(input: { seed; width; height; windX; windY }) }`, `type WorldRow`; `ProfilesRepository { find(worldId, playerId); create(client, input); worldIdsFor(playerId): Promise<Set<number>> }`, `type ProfileRow`; `ProfileGuard`, `WorldWritableGuard`, `interface WorldRequest extends AuthenticatedRequest { world: WorldRow; profile: ProfileRow }`; `WorldsService { list(playerId); state(world, profile, playerId); create(input) }`; `worldListItem(row, joined)`, `worldState(row, profile, playerId)`; fixture `createWorld(app, overrides?)`.

- [ ] **Step 1: Napisz test jednostkowy `WorldWritableGuard` i test e2e światów**

`src/modules/worlds/world-writable.guard.spec.ts`:

```ts
import { ConflictException, ExecutionContext } from '@nestjs/common';
import { WorldWritableGuard } from './world-writable.guard.js';

function contextWithWorld(status: string | undefined): ExecutionContext {
  const req = status === undefined ? {} : { world: { status } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('WorldWritableGuard', () => {
  const guard = new WorldWritableGuard();

  it('przepuszcza OPEN i CLOSED', () => {
    expect(guard.canActivate(contextWithWorld('OPEN'))).toBe(true);
    expect(guard.canActivate(contextWithWorld('CLOSED'))).toBe(true);
  });

  it('ENDED -> 409', () => {
    expect(() => guard.canActivate(contextWithWorld('ENDED'))).toThrow(ConflictException);
  });

  it('bez ProfileGuard przed sobą zgłasza błąd programisty, nie 409', () => {
    expect(() => guard.canActivate(contextWithWorld(undefined))).toThrow(/ProfileGuard/);
  });
});
```

`test/worlds.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { ProfilesRepository } from '../src/modules/worlds/profiles.repository.js';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { bearer, createWorld, registerPlayer } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('worlds (e2e)', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /worlds bez tokenu -> 401, ze złym tokenem -> 401', async () => {
    await http().get('/api/v1/worlds').expect(401);
    await http().get('/api/v1/worlds').set('Authorization', 'Bearer nie.jwt.token').expect(401);
  });

  it('GET /worlds listuje światy z flagą joined', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app, { seed: 4242 });
    await app.get(ProfilesRepository).create(app.get<Db>(DB), { worldId: world.id, playerId: p.playerId, homeX: null, homeY: null });
    const other = await createWorld(app, { seed: 4343 });

    const res = await http().get('/api/v1/worlds').set('Authorization', bearer(p.accessToken)).expect(200);
    const mine = res.body.find((w: { id: string }) => w.id === String(world.id));
    const notMine = res.body.find((w: { id: string }) => w.id === String(other.id));
    expect(mine).toEqual({
      id: String(world.id),
      seed: 4242,
      size: { w: 200, h: 200 },
      wind: { x: 0.3, y: -0.1 },
      status: 'OPEN',
      joined: true,
    });
    expect(notMine.joined).toBe(false);
  });

  it('GET /worlds/:id/state: 404 dla nieistniejącego, 403 bez profilu, 200 z profilem', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app);
    await http().get('/api/v1/worlds/999999/state').set('Authorization', bearer(p.accessToken)).expect(404);
    await http().get('/api/v1/worlds/abc/state').set('Authorization', bearer(p.accessToken)).expect(404);
    await http().get(`/api/v1/worlds/${world.id}/state`).set('Authorization', bearer(p.accessToken)).expect(403);

    await app.get(ProfilesRepository).create(app.get<Db>(DB), { worldId: world.id, playerId: p.playerId, homeX: null, homeY: null });
    const res = await http().get(`/api/v1/worlds/${world.id}/state`).set('Authorization', bearer(p.accessToken)).expect(200);
    // toMatchObject, nie toEqual: Task 16 dołoży do odpowiedzi-obiektów pole `serverTime`, które sprawdza http.e2e-spec.ts
    expect(res.body).toMatchObject({
      id: String(world.id),
      seed: 1337,
      size: { w: 200, h: 200 },
      wind: { x: 0.3, y: -0.1 },
      status: 'OPEN',
      playerId: p.playerId,
      homeSettlement: null,
    });
  });

  it('state działa także na świecie ENDED (odczyt zawsze dozwolony)', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app, { status: 'ENDED' });
    await app.get(ProfilesRepository).create(app.get<Db>(DB), { worldId: world.id, playerId: p.playerId, homeX: null, homeY: null });
    const res = await http().get(`/api/v1/worlds/${world.id}/state`).set('Authorization', bearer(p.accessToken)).expect(200);
    expect(res.body.status).toBe('ENDED');
  });
});
```

Dopisz do `test/support/fixtures.ts`:

```ts
import { WorldsService } from '../../src/modules/worlds/worlds.service.js';
import type { WorldRow } from '../../src/modules/worlds/worlds.repository.js';

/** Tworzy świat tak samo jak `npm run world:create`; domyślnie seed 1337, 200×200, wiatr (0.3, -0.1). */
export async function createWorld(
  app: INestApplication,
  overrides: Partial<{ seed: number; width: number; height: number; windX: number; windY: number; status: 'OPEN' | 'CLOSED' | 'ENDED' }> = {},
): Promise<WorldRow> {
  return app.get(WorldsService).create({
    seed: 1337,
    width: 200,
    height: 200,
    windX: 0.3,
    windY: -0.1,
    ...overrides,
  });
}
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/modules/worlds && npm run test:e2e -- test/worlds.e2e-spec.ts`
Expected: FAIL — brak modułów.

- [ ] **Step 3: Repozytoria**

`src/modules/worlds/worlds.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { worlds } from '../../infra/db/schema/index.js';

export type WorldRow = typeof worlds.$inferSelect;
export type WorldStatus = WorldRow['status'];

export interface CreateWorldInput {
  seed: number;
  width: number;
  height: number;
  windX: number;
  windY: number;
  status?: WorldStatus;
}

@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  list(): Promise<WorldRow[]> {
    return this.db.select().from(worlds).orderBy(asc(worlds.id));
  }

  findById(id: number): Promise<WorldRow | undefined> {
    return this.db.query.worlds.findFirst({ where: eq(worlds.id, id) });
  }

  async create(input: CreateWorldInput): Promise<WorldRow> {
    const [row] = await this.db.insert(worlds).values(input).returning();
    return row;
  }
}
```

`src/modules/worlds/profiles.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { profiles } from '../../infra/db/schema/index.js';

export type ProfileRow = typeof profiles.$inferSelect;

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  find(worldId: number, playerId: number): Promise<ProfileRow | undefined> {
    return this.db.query.profiles.findFirst({
      where: and(eq(profiles.worldId, worldId), eq(profiles.playerId, playerId)),
    });
  }

  /** Przyjmuje bazę albo transakcję, bo `join` wstawia profil razem z osadą. */
  async create(
    client: DbClient,
    input: { worldId: number; playerId: number; homeX: number | null; homeY: number | null },
  ): Promise<ProfileRow> {
    const [row] = await client.insert(profiles).values(input).returning();
    return row;
  }

  async worldIdsFor(playerId: number): Promise<Set<number>> {
    const rows = await this.db
      .select({ worldId: profiles.worldId })
      .from(profiles)
      .where(eq(profiles.playerId, playerId));
    return new Set(rows.map((r) => r.worldId));
  }
}
```

- [ ] **Step 4: Widoki, strażnicy, serwis, kontroler, DTO, moduł**

`src/modules/worlds/world-views.ts`:

```ts
import type { ProfileRow } from './profiles.repository.js';
import type { WorldRow } from './worlds.repository.js';

export interface WorldListItem {
  id: string;
  seed: number;
  size: { w: number; h: number };
  wind: { x: number; y: number };
  status: WorldRow['status'];
  joined: boolean;
}

export interface WorldStateView extends Omit<WorldListItem, 'joined'> {
  playerId: number;
  homeSettlement: { x: number; y: number } | null;
}

function base(world: WorldRow): Omit<WorldListItem, 'joined'> {
  return {
    id: String(world.id),
    seed: world.seed,
    size: { w: world.width, h: world.height },
    wind: { x: world.windX, y: world.windY },
    status: world.status,
  };
}

export function worldListItem(world: WorldRow, joined: boolean): WorldListItem {
  return { ...base(world), joined };
}

/** Kształt z sekcji 4.1 specu klienta; `serverTime` dokłada interceptor. */
export function worldState(world: WorldRow, profile: ProfileRow, playerId: number): WorldStateView {
  return {
    ...base(world),
    playerId,
    homeSettlement: profile.homeX === null || profile.homeY === null ? null : { x: profile.homeX, y: profile.homeY },
  };
}
```

`src/modules/worlds/profile.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { ProfilesRepository, type ProfileRow } from './profiles.repository.js';
import { WorldsRepository, type WorldRow } from './worlds.repository.js';

export interface WorldRequest extends AuthenticatedRequest {
  world: WorldRow;
  profile: ProfileRow;
}

/** Wymaga profilu gracza na świecie z `:id`. Nie sprawdza statusu świata — odczyt działa na każdym. */
@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(
    private readonly worlds: WorldsRepository,
    private readonly profiles: ProfilesRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorldRequest>();
    const worldId = Number(req.params.id);
    if (!Number.isInteger(worldId) || worldId <= 0) {
      throw new NotFoundException('Świat nie istnieje');
    }
    const world = await this.worlds.findById(worldId);
    if (!world) {
      throw new NotFoundException('Świat nie istnieje');
    }
    const profile = await this.profiles.find(worldId, req.playerId);
    if (!profile) {
      throw new ForbiddenException('Nie masz profilu na tym świecie');
    }
    req.world = world;
    req.profile = profile;
    return true;
  }
}
```

`src/modules/worlds/world-writable.guard.ts`:

```ts
import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import type { WorldRequest } from './profile.guard.js';

/** Zapisy tylko na OPEN i CLOSED; ENDED jest do odczytu. Zakładać po ProfileGuard: @UseGuards(ProfileGuard, WorldWritableGuard). */
@Injectable()
export class WorldWritableGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Partial<WorldRequest>>();
    if (!req.world) {
      throw new Error('WorldWritableGuard wymaga ProfileGuard przed sobą');
    }
    if (req.world.status === 'ENDED') {
      throw new ConflictException('Runda zakończona, świat jest tylko do odczytu');
    }
    return true;
  }
}
```

`src/modules/worlds/worlds.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class SizeDto {
  @ApiProperty() w!: number;
  @ApiProperty() h!: number;
}
class VectorDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
}

export class WorldListItemDto {
  @ApiProperty({ example: '1' }) id!: string;
  @ApiProperty() seed!: number;
  @ApiProperty({ type: SizeDto }) size!: SizeDto;
  @ApiProperty({ type: VectorDto }) wind!: VectorDto;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'ENDED'] }) status!: string;
  @ApiProperty() joined!: boolean;
}

export class WorldStateDto {
  @ApiProperty({ example: '1' }) id!: string;
  @ApiProperty() seed!: number;
  @ApiProperty({ type: SizeDto }) size!: SizeDto;
  @ApiProperty({ type: VectorDto }) wind!: VectorDto;
  @ApiProperty({ enum: ['OPEN', 'CLOSED', 'ENDED'] }) status!: string;
  @ApiProperty() playerId!: number;
  @ApiPropertyOptional({ type: VectorDto, nullable: true }) homeSettlement!: VectorDto | null;
  @ApiProperty({ example: '2026-09-08T12:00:00.000Z' }) serverTime!: string;
}
```

`src/modules/worlds/worlds.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { ProfileRow } from './profiles.repository.js';
import { ProfilesRepository } from './profiles.repository.js';
import { type WorldListItem, type WorldStateView, worldListItem, worldState } from './world-views.js';
import { type CreateWorldInput, type WorldRow, WorldsRepository } from './worlds.repository.js';

@Injectable()
export class WorldsService {
  constructor(
    private readonly worlds: WorldsRepository,
    private readonly profiles: ProfilesRepository,
  ) {}

  async list(playerId: number): Promise<WorldListItem[]> {
    const [rows, joined] = await Promise.all([this.worlds.list(), this.profiles.worldIdsFor(playerId)]);
    return rows.map((w) => worldListItem(w, joined.has(w.id)));
  }

  state(world: WorldRow, profile: ProfileRow, playerId: number): WorldStateView {
    return worldState(world, profile, playerId);
  }

  create(input: CreateWorldInput): Promise<WorldRow> {
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2147483647) {
      throw new RangeError('seed musi być liczbą całkowitą w [0, 2147483647]');
    }
    if (input.width < 1 || input.height < 1) {
      throw new RangeError('width i height muszą być dodatnie');
    }
    return this.worlds.create(input);
  }
}
```

`src/modules/worlds/worlds.controller.ts`:

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer } from '../auth/current-player.decorator.js';
import { ProfileGuard, type WorldRequest } from './profile.guard.js';
import { WorldListItemDto, WorldStateDto } from './worlds.dto.js';
import { WorldsService } from './worlds.service.js';

@ApiTags('worlds')
@ApiBearerAuth()
@Controller('worlds')
export class WorldsController {
  constructor(private readonly service: WorldsService) {}

  @Get()
  @ApiOkResponse({ type: [WorldListItemDto] })
  list(@CurrentPlayer() playerId: number): Promise<WorldListItemDto[]> {
    return this.service.list(playerId);
  }

  @Get(':id/state')
  @UseGuards(ProfileGuard)
  @ApiOkResponse({ type: WorldStateDto })
  @ApiNotFoundResponse({ description: 'Świat nie istnieje' })
  @ApiForbiddenResponse({ description: 'Brak profilu na tym świecie' })
  state(@Req() req: WorldRequest): Omit<WorldStateDto, 'serverTime'> {
    return this.service.state(req.world, req.profile, req.playerId);
  }
}
```

`src/modules/worlds/worlds.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ProfileGuard } from './profile.guard.js';
import { ProfilesRepository } from './profiles.repository.js';
import { WorldWritableGuard } from './world-writable.guard.js';
import { WorldsController } from './worlds.controller.js';
import { WorldsRepository } from './worlds.repository.js';
import { WorldsService } from './worlds.service.js';

@Module({
  controllers: [WorldsController],
  providers: [WorldsRepository, ProfilesRepository, WorldsService, ProfileGuard, WorldWritableGuard],
  exports: [WorldsRepository, ProfilesRepository, WorldsService, ProfileGuard, WorldWritableGuard],
})
export class WorldsModule {}
```

- [ ] **Step 5: CLI `world:create`**

`src/cli/create-world.ts`:

```ts
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { parseEnv } from '../infra/config/env.js';
import { WorldsService } from '../modules/worlds/worlds.service.js';

const { values } = parseArgs({
  options: {
    seed: { type: 'string' },
    width: { type: 'string', default: '200' },
    height: { type: 'string', default: '200' },
    wind: { type: 'string', default: '0,0' },
  },
});

if (values.seed === undefined) {
  console.error('Użycie: npm run world:create -- --seed 1337 [--width 200] [--height 200] [--wind 0.3,-0.1]');
  process.exit(2);
}
const [windX, windY] = values.wind.split(',').map(Number);
if (!Number.isFinite(windX) || !Number.isFinite(windY)) {
  console.error('--wind oczekuje dwóch liczb rozdzielonych przecinkiem, np. 0.3,-0.1');
  process.exit(2);
}

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseEnv(process.env);
const context = await NestFactory.createApplicationContext(AppModule.forRoot(env), { logger: ['error'] });
try {
  const world = await context.get(WorldsService).create({
    seed: Number(values.seed),
    width: Number(values.width),
    height: Number(values.height),
    windX,
    windY,
  });
  console.log(`Utworzono świat id=${world.id} seed=${world.seed} ${world.width}x${world.height} wiatr=(${world.windX}, ${world.windY})`);
} finally {
  await context.close();
}
```

- [ ] **Step 6: Uruchom testy**

Run: `npx vitest run src/modules/worlds && npm run test:e2e`
Expected: PASS — 3 testy jednostkowe strażnika, 4 e2e światów, wcześniejsze e2e.

- [ ] **Step 7: Sprawdź CLI na compose**

Run: `npm run compose:up && npm run world:create -- --seed 1337 --wind 0.3,-0.1`
Expected: `Utworzono świat id=1 seed=1337 200x200 wiatr=(0.3, -0.1)` (id może być większe, jeśli baza już miała światy).

- [ ] **Step 8: Commit**

```bash
npm run lint && git add -A && git commit -m "Add worlds listing, world state, profile and writable guards and world:create CLI"
```

---

## Task 13: Osady — repozytorium, dwa widoki, `bbox`, odczyty z regułami informacyjnymi

**Files:**
- Create: `src/modules/settlements/settlements.repository.ts`, `src/modules/settlements/settlement-views.ts`, `src/modules/settlements/settlement-views.spec.ts`, `src/modules/settlements/bbox.ts`, `src/modules/settlements/bbox.spec.ts`, `src/modules/settlements/settlements.service.ts`, `src/modules/settlements/settlements.controller.ts`, `src/modules/settlements/settlements.dto.ts`
- Modify: `src/modules/settlements/settlements.module.ts`

**Interfaces:**
- Consumes: Task 4, 8, 9, 10, 12 (`ProfileGuard`, `WorldRequest`, `WorldsModule`).
- Produces: `interface SettlementRecord { worldId: number; x: number; y: number; ownerId: number; ownerName: string; name: string; biome: Biome; resources: Resources; population: number; lastSyncAt: Date; buildings: BuildingLevels }`; `SettlementsRepository { listOwn(worldId, ownerId); listInBbox(worldId, bbox); listCoords(worldId): Promise<Set<string>>; findOne(worldId, x, y); insertWithBuildings(client, input) }`; `publicView(s)`, `ownView(s, now)`, `viewFor(s, requesterId, now)`; `parseBbox(raw, world): Bbox`, `MAX_BBOX_CELLS = 4096`, `coordKey(x, y)`.

- [ ] **Step 1: Napisz testy jednostkowe widoków i bbox**

`src/modules/settlements/settlement-views.spec.ts`:

```ts
import { ownView, publicView, viewFor, type SettlementRecord } from './settlement-views.js';

const record: SettlementRecord = {
  worldId: 1,
  x: 80,
  y: 73,
  ownerId: 7,
  ownerName: 'sebastian',
  name: 'Koralowa',
  biome: 'TROPICAL',
  resources: { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 },
  population: 0,
  lastSyncAt: new Date('2026-09-08T12:00:00.000Z'),
  buildings: { TOWN_HALL: 1, WAREHOUSE: 1, SAWMILL: 1, FARM: 1 },
};
const now = new Date('2026-09-08T13:00:00.000Z');

describe('publicView', () => {
  it('ma wyłącznie dane publiczne i nie ma klucza resources', () => {
    const view = publicView(record);
    expect(view).toEqual({ world: '1', x: 80, y: 73, ownerId: 7, ownerName: 'sebastian', name: 'Koralowa' });
    expect('resources' in view).toBe(false);
    expect(Object.keys(view).sort()).toEqual(['name', 'ownerId', 'ownerName', 'world', 'x', 'y']);
  });
});

describe('ownView', () => {
  it('kształt z sekcji 4.2 specu klienta, zasoby zmaterializowane na now, sześć slotów', () => {
    const view = ownView(record, now);
    expect(view).toEqual({
      world: '1',
      x: 80,
      y: 73,
      ownerId: 7,
      ownerName: 'sebastian',
      name: 'Koralowa',
      resources: { wood: 560, stone: 200, food: 1080, iron: 40, sulfur: 0 },
      productionPerHour: { wood: 60, stone: 0, food: 80, iron: 0, sulfur: 0 },
      capacity: 2000,
      population: 0,
      populationMax: 100,
      buildings: { TOWN_HALL: 1, BARRACKS: 0, SHIPYARD: 0, WAREHOUSE: 1, SAWMILL: 1, FARM: 1 },
      lastSyncAt: '2026-09-08T13:00:00.000Z',
    });
  });

  it('obcina zasoby do pojemności', () => {
    const later = new Date('2026-09-10T12:00:00.000Z');
    expect(ownView(record, later).resources.wood).toBe(2000);
  });
});

describe('viewFor', () => {
  it('właściciel dostaje ownView, każdy inny publicView', () => {
    expect('resources' in viewFor(record, 7, now)).toBe(true);
    expect('resources' in viewFor(record, 9, now)).toBe(false);
  });
});
```

`src/modules/settlements/bbox.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { MAX_BBOX_CELLS, parseBbox } from './bbox.js';

const world = { width: 200, height: 200 };

describe('parseBbox', () => {
  it('parsuje i normalizuje kolejność rogów', () => {
    expect(parseBbox('10,20,5,7', world)).toEqual({ x1: 5, y1: 7, x2: 10, y2: 20 });
    expect(parseBbox('0,0,63,63', world)).toEqual({ x1: 0, y1: 0, x2: 63, y2: 63 });
  });

  it('odrzuca zły format, ułamki, poza mapą i zbyt duży prostokąt', () => {
    for (const bad of ['1,2,3', 'a,b,c,d', '1.5,2,3,4', '-1,0,5,5', '0,0,200,5', '0,0,64,63', '']) {
      expect(() => parseBbox(bad, world), bad).toThrow(BadRequestException);
    }
    expect(MAX_BBOX_CELLS).toBe(4096);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/modules/settlements`
Expected: FAIL — brak modułów.

- [ ] **Step 3: Widoki i bbox**

`src/modules/settlements/settlement-views.ts`:

```ts
import { capacityFor, populationMaxFor, productionPerHour } from '../../domain/balance/index.js';
import { currentResources } from '../../domain/economy/index.js';
import { type Biome, type BuildingLevels, type Resources, slotsFor } from '../../domain/rules/index.js';

export interface SettlementRecord {
  worldId: number;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  name: string;
  biome: Biome;
  resources: Resources;
  population: number;
  lastSyncAt: Date;
  buildings: BuildingLevels;
}

/** Public Data ze słownika: to, co każdy widzi o każdej osadzie. BEZ klucza `resources`. */
export interface PublicSettlementView {
  world: string;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  name: string;
}

export interface OwnSettlementView extends PublicSettlementView {
  resources: Resources;
  productionPerHour: Resources;
  capacity: number;
  population: number;
  populationMax: number;
  buildings: Record<string, number>;
  lastSyncAt: string;
}

export function publicView(s: SettlementRecord): PublicSettlementView {
  return { world: String(s.worldId), x: s.x, y: s.y, ownerId: s.ownerId, ownerName: s.ownerName, name: s.name };
}

/** Zasoby zmaterializowane leniwie na `now` bez zapisu; `lastSyncAt = now`, żeby klient ekstrapolował od tej chwili. */
export function ownView(s: SettlementRecord, now: Date): OwnSettlementView {
  const rate = productionPerHour(s.biome, s.buildings);
  const capacity = capacityFor(s.buildings);
  return {
    ...publicView(s),
    resources: currentResources(s.resources, rate, s.lastSyncAt, now, capacity),
    productionPerHour: rate,
    capacity,
    population: s.population,
    populationMax: populationMaxFor(s.buildings),
    buildings: Object.fromEntries(slotsFor(s.biome).map((slot) => [slot, s.buildings[slot] ?? 0])),
    lastSyncAt: now.toISOString(),
  };
}

/** Jedyne miejsce decydujące, kto co widzi. */
export function viewFor(s: SettlementRecord, requesterId: number, now: Date): PublicSettlementView | OwnSettlementView {
  return s.ownerId === requesterId ? ownView(s, now) : publicView(s);
}
```

`src/modules/settlements/bbox.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export interface Bbox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Klient przy zoomie 0.25 widzi ok. 17×30 komórek; 64×64 daje zapas bez otwierania całej mapy. */
export const MAX_BBOX_CELLS = 4096;

export function coordKey(x: number, y: number): string {
  return `${x}:${y}`;
}

/** `bbox=x1,y1,x2,y2` — domknięty, w granicach mapy, o powierzchni ≤ MAX_BBOX_CELLS. */
export function parseBbox(raw: string, world: { width: number; height: number }): Bbox {
  const parts = raw.split(',');
  if (parts.length !== 4 || parts.some((p) => !/^-?\d+$/.test(p.trim()))) {
    throw new BadRequestException('bbox musi mieć postać x1,y1,x2,y2 z liczbami całkowitymi');
  }
  const [ax, ay, bx, by] = parts.map((p) => Number(p.trim()));
  const box: Bbox = { x1: Math.min(ax, bx), y1: Math.min(ay, by), x2: Math.max(ax, bx), y2: Math.max(ay, by) };
  if (box.x1 < 0 || box.y1 < 0 || box.x2 >= world.width || box.y2 >= world.height) {
    throw new BadRequestException(`bbox poza mapą ${world.width}x${world.height}`);
  }
  const cells = (box.x2 - box.x1 + 1) * (box.y2 - box.y1 + 1);
  if (cells > MAX_BBOX_CELLS) {
    throw new BadRequestException(`bbox obejmuje ${cells} komórek, maksimum ${MAX_BBOX_CELLS}`);
  }
  return box;
}
```

- [ ] **Step 4: Repozytorium**

`src/modules/settlements/settlements.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, between, eq } from 'drizzle-orm';
import type { Biome, Building, BuildingLevels, Resources } from '../../domain/rules/index.js';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { buildings, players, settlements } from '../../infra/db/schema/index.js';
import type { Bbox } from './bbox.js';
import { coordKey } from './bbox.js';
import type { SettlementRecord } from './settlement-views.js';

export interface InsertSettlementInput {
  worldId: number;
  x: number;
  y: number;
  ownerId: number;
  name: string;
  biome: Biome;
  resources: Resources;
  lastSyncAt: Date;
  buildings: Record<Building, number>;
}

type SettlementBase = Omit<SettlementRecord, 'buildings'>;

@Injectable()
export class SettlementsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  listOwn(worldId: number, ownerId: number): Promise<SettlementRecord[]> {
    return this.load(and(eq(settlements.worldId, worldId), eq(settlements.ownerId, ownerId)));
  }

  listInBbox(worldId: number, bbox: Bbox): Promise<SettlementRecord[]> {
    return this.load(
      and(
        eq(settlements.worldId, worldId),
        between(settlements.x, bbox.x1, bbox.x2),
        between(settlements.y, bbox.y1, bbox.y2),
      ),
    );
  }

  async findOne(worldId: number, x: number, y: number): Promise<SettlementRecord | undefined> {
    const [row] = await this.load(and(eq(settlements.worldId, worldId), eq(settlements.x, x), eq(settlements.y, y)));
    return row;
  }

  /** Klucze "x:y" wszystkich osad świata — do sprawdzania, czy wyspa jest zajęta. */
  async listCoords(worldId: number): Promise<Set<string>> {
    const rows = await this.db
      .select({ x: settlements.x, y: settlements.y })
      .from(settlements)
      .where(eq(settlements.worldId, worldId));
    return new Set(rows.map((r) => coordKey(r.x, r.y)));
  }

  /** Osada i jej sześć slotów w jednej transakcji wywołującego. Rzuca 23505 na `settlements_pk`, gdy wyspa zajęta. */
  async insertWithBuildings(client: DbClient, input: InsertSettlementInput): Promise<void> {
    await client.insert(settlements).values({
      worldId: input.worldId,
      x: input.x,
      y: input.y,
      ownerId: input.ownerId,
      name: input.name,
      biome: input.biome,
      ...input.resources,
      population: 0,
      lastSyncAt: input.lastSyncAt,
    });
    await client.insert(buildings).values(
      (Object.entries(input.buildings) as [Building, number][]).map(([type, level]) => ({
        worldId: input.worldId,
        x: input.x,
        y: input.y,
        biome: input.biome,
        type,
        level,
      })),
    );
  }

  private async load(where: ReturnType<typeof and>): Promise<SettlementRecord[]> {
    const rows = await this.db
      .select({
        worldId: settlements.worldId,
        x: settlements.x,
        y: settlements.y,
        ownerId: settlements.ownerId,
        ownerName: players.nickname,
        name: settlements.name,
        biome: settlements.biome,
        wood: settlements.wood,
        stone: settlements.stone,
        food: settlements.food,
        iron: settlements.iron,
        sulfur: settlements.sulfur,
        population: settlements.population,
        lastSyncAt: settlements.lastSyncAt,
      })
      .from(settlements)
      .innerJoin(players, eq(players.id, settlements.ownerId))
      .where(where);
    if (rows.length === 0) return [];

    const bases: SettlementBase[] = rows.map((r) => ({
      worldId: r.worldId,
      x: r.x,
      y: r.y,
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      name: r.name,
      biome: r.biome,
      resources: { wood: r.wood, stone: r.stone, food: r.food, iron: r.iron, sulfur: r.sulfur },
      population: r.population,
      lastSyncAt: r.lastSyncAt,
    }));

    // Złączenie z tym samym warunkiem co osady: `inArray` po x i po y osobno dałoby iloczyn kartezjański
    // i wciągnąłby budynki cudzych osad o współrzędnych mieszanych z dwóch różnych wierszy.
    const levels = await this.db
      .select({ x: buildings.x, y: buildings.y, type: buildings.type, level: buildings.level })
      .from(buildings)
      .innerJoin(
        settlements,
        and(
          eq(settlements.worldId, buildings.worldId),
          eq(settlements.x, buildings.x),
          eq(settlements.y, buildings.y),
        ),
      )
      .where(where);
    const byCoord = new Map<string, BuildingLevels>();
    for (const l of levels) {
      const key = coordKey(l.x, l.y);
      const entry = byCoord.get(key) ?? {};
      entry[l.type] = l.level;
      byCoord.set(key, entry);
    }
    return bases.map((b) => ({ ...b, buildings: byCoord.get(coordKey(b.x, b.y)) ?? {} }));
  }
}
```

- [ ] **Step 5: Serwis, kontroler, DTO, moduł**

`src/modules/settlements/settlements.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ResourcesDto {
  @ApiProperty() wood!: number;
  @ApiProperty() stone!: number;
  @ApiProperty() food!: number;
  @ApiProperty() iron!: number;
  @ApiProperty() sulfur!: number;
}

/** Cudza osada ma tylko pola publiczne; własna dodatkowo pola od `resources` w dół. Brak `resources` = osada cudza. */
export class SettlementDto {
  @ApiProperty({ example: '1' }) world!: string;
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
  @ApiProperty() ownerId!: number;
  @ApiProperty() ownerName!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: ResourcesDto }) resources?: ResourcesDto;
  @ApiPropertyOptional({ type: ResourcesDto }) productionPerHour?: ResourcesDto;
  @ApiPropertyOptional() capacity?: number;
  @ApiPropertyOptional() population?: number;
  @ApiPropertyOptional() populationMax?: number;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'number' } }) buildings?: Record<string, number>;
  @ApiPropertyOptional({ example: '2026-09-08T12:00:00.000Z' }) lastSyncAt?: string;
}
```

`src/modules/settlements/settlements.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../domain/time/index.js';
import { CLOCK } from '../../infra/time/time.module.js';
import type { WorldRow } from '../worlds/worlds.repository.js';
import { parseBbox } from './bbox.js';
import { type OwnSettlementView, type PublicSettlementView, viewFor } from './settlement-views.js';
import { SettlementsRepository } from './settlements.repository.js';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly settlements: SettlementsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bez bbox: własne osady w pełni. Z bbox: wszystkie w prostokącie, własne w pełni, cudze publicznie. */
  async list(world: WorldRow, requesterId: number, bboxRaw?: string): Promise<(PublicSettlementView | OwnSettlementView)[]> {
    const now = this.clock.now();
    const records =
      bboxRaw === undefined
        ? await this.settlements.listOwn(world.id, requesterId)
        : await this.settlements.listInBbox(world.id, parseBbox(bboxRaw, world));
    return records.map((r) => viewFor(r, requesterId, now));
  }
}
```

`src/modules/settlements/settlements.controller.ts`:

```ts
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProfileGuard, type WorldRequest } from '../worlds/profile.guard.js';
import { SettlementDto } from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller('worlds/:id/settlements')
@UseGuards(ProfileGuard)
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get()
  @ApiQuery({ name: 'bbox', required: false, example: '60,60,100,100', description: 'x1,y1,x2,y2 — domknięty, ≤ 4096 komórek' })
  @ApiOkResponse({ type: [SettlementDto] })
  @ApiBadRequestResponse({ description: 'Zły bbox' })
  list(@Req() req: WorldRequest, @Query('bbox') bbox?: string): Promise<SettlementDto[]> {
    return this.service.list(req.world, req.playerId, bbox);
  }
}
```

`src/modules/settlements/settlements.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsRepository } from './settlements.repository.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [WorldsModule],
  controllers: [SettlementsController],
  providers: [SettlementsRepository, SettlementsService],
  exports: [SettlementsRepository],
})
export class SettlementsModule {}
```

- [ ] **Step 6: Uruchom testy jednostkowe**

Run: `npx vitest run src/modules/settlements && npm run build`
Expected: PASS (5 testów widoków, 2 bbox), build bez błędów. E2E odczytów dochodzi w Task 14, gdy `join` tworzy osady.

- [ ] **Step 7: Commit**

```bash
npm run lint && git add -A && git commit -m "Add settlements repository, public and owner views and bbox listing"
```

---

## Task 14: Dołączanie do świata — `pickHomeIsland` i `POST /worlds/:id/join`

**Files:**
- Create: `src/modules/worlds/home-island-picker.ts`, `src/modules/worlds/home-island-picker.spec.ts`, `test/settlements.e2e-spec.ts`
- Modify: `src/modules/worlds/worlds.service.ts`, `src/modules/worlds/worlds.controller.ts`, `src/modules/worlds/worlds.dto.ts`, `src/modules/worlds/worlds.module.ts`, `test/support/fixtures.ts`, `test/worlds.e2e-spec.ts`

**Interfaces:**
- Consumes: `islandAt` (Task 6), `STARTER_PACK`, `startingBuildings` (Task 9), `SettlementsRepository`, `ownView` (Task 13), `isUniqueViolation` (Task 4).
- Produces: `pickHomeIsland(world: { seed; width; height }, isTaken: (x, y) => boolean, randomInt: (maxExclusive: number) => number): { x; y; biome } | null`, `ringCells(cx, cy, r): Iterable<[number, number]>`; `WorldsService.join(worldId, playerId, name?)`; fixture `joinWorld(app, accessToken, worldId, name?)`.

- [ ] **Step 1: Napisz test jednostkowy pickera**

`src/modules/worlds/home-island-picker.spec.ts`:

```ts
import { islandAt } from '../../domain/geography/index.js';
import { pickHomeIsland, ringCells } from './home-island-picker.js';

const world = { seed: 1337, width: 200, height: 200 };
const never = () => false;
const first = () => 0;

describe('ringCells', () => {
  it('r = 0 to sam środek, r = 1 to 8 komórek, r = 2 to 16', () => {
    expect([...ringCells(5, 5, 0)]).toEqual([[5, 5]]);
    expect([...ringCells(5, 5, 1)]).toHaveLength(8);
    expect([...ringCells(5, 5, 2)]).toHaveLength(16);
    for (const [x, y] of ringCells(5, 5, 2)) expect(Math.max(Math.abs(x - 5), Math.abs(y - 5))).toBe(2);
  });
});

describe('pickHomeIsland', () => {
  it('zwraca wolną wyspę TROPICAL lub TEMPERATE, która według islandAt jest lądem', () => {
    const pick = pickHomeIsland(world, never, first);
    expect(pick).not.toBeNull();
    const island = islandAt(world.seed, pick!.x, pick!.y);
    expect(island).not.toBeNull();
    expect(['TROPICAL', 'TEMPERATE']).toContain(pick!.biome);
    expect(pick!.biome).toBe(island!.biome);
  });

  it('wybiera z najbliższego środka pierścienia z kandydatką; zajęte komórki pomija', () => {
    const a = pickHomeIsland(world, never, first)!;
    const ringA = Math.max(Math.abs(a.x - 100), Math.abs(a.y - 100));
    const b = pickHomeIsland(world, (x, y) => x === a.x && y === a.y, first)!;
    expect(b).not.toEqual(a);
    expect(Math.max(Math.abs(b.x - 100), Math.abs(b.y - 100))).toBeGreaterThanOrEqual(ringA);
  });

  it('używa randomInt do wyboru w obrębie pierścienia', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const p = pickHomeIsland(world, never, (n) => i % n)!;
      seen.add(`${p.x}:${p.y}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it('nie wychodzi poza mapę i zwraca null, gdy wszystko zajęte', () => {
    const small = { seed: 1337, width: 6, height: 6 };
    const p = pickHomeIsland(small, never, first);
    if (p) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(6);
      expect(p.y).toBeLessThan(6);
    }
    expect(pickHomeIsland(small, () => true, first)).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/modules/worlds/home-island-picker.spec.ts`
Expected: FAIL — brak modułu.

- [ ] **Step 3: Zaimplementuj picker**

`src/modules/worlds/home-island-picker.ts`:

```ts
import { islandAt, type Biome } from '../../domain/geography/index.js';

export interface HomeIslandPick {
  x: number;
  y: number;
  biome: Biome;
}

/** Komórki w odległości Czebyszewa dokładnie r od (cx, cy). r = 0 to sam środek. */
export function* ringCells(cx: number, cy: number, r: number): Generator<[number, number]> {
  if (r === 0) {
    yield [cx, cy];
    return;
  }
  for (let x = cx - r; x <= cx + r; x++) {
    yield [x, cy - r];
    yield [x, cy + r];
  }
  for (let y = cy - r + 1; y <= cy + r - 1; y++) {
    yield [cx - r, y];
    yield [cx + r, y];
  }
}

/**
 * Losowa wolna wyspa z jedzeniem (TROPICAL lub TEMPERATE) z najbliższego środka pierścienia,
 * w którym taka istnieje. Gracze lądują blisko siebie, a pierścień rośnie, gdy w środku brakuje miejsca.
 * Czysta funkcja: zajętość i losowość przychodzą z zewnątrz.
 */
export function pickHomeIsland(
  world: { seed: number; width: number; height: number },
  isTaken: (x: number, y: number) => boolean,
  randomInt: (maxExclusive: number) => number,
): HomeIslandPick | null {
  const cx = Math.floor(world.width / 2);
  const cy = Math.floor(world.height / 2);
  const maxRing = Math.max(cx, world.width - 1 - cx, cy, world.height - 1 - cy);
  for (let r = 0; r <= maxRing; r++) {
    const candidates: HomeIslandPick[] = [];
    for (const [x, y] of ringCells(cx, cy, r)) {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      if (isTaken(x, y)) continue;
      const island = islandAt(world.seed, x, y);
      if (island && island.biome !== 'VOLCANIC') {
        candidates.push({ x, y, biome: island.biome });
      }
    }
    if (candidates.length > 0) {
      return candidates[randomInt(candidates.length)];
    }
  }
  return null;
}
```

- [ ] **Step 4: Uruchom test pickera**

Run: `npx vitest run src/modules/worlds/home-island-picker.spec.ts`
Expected: PASS, 5 testów.

- [ ] **Step 5: Napisz e2e dołączania i reguł informacyjnych**

Dopisz do `test/support/fixtures.ts`:

```ts
/** POST /worlds/:id/join; zwraca ciało odpowiedzi (własna osada domowa + serverTime). */
export async function joinWorld(app: INestApplication, accessToken: string, worldId: number, name?: string) {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/worlds/${worldId}/join`)
    .set('Authorization', bearer(accessToken))
    .send(name === undefined ? {} : { name })
    .expect(201);
  return res.body as Record<string, unknown> & { x: number; y: number };
}
```

Dopisz do `test/worlds.e2e-spec.ts` (w tym samym `describe`):

```ts
  it('join zakłada osadę domową na wyspie z jedzeniem, z budynkami startowymi i pakietem startowym', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app);
    const body = await joinWorld(app, p.accessToken, world.id, 'Koralowa');

    const island = islandAt(1337, body.x, body.y);
    expect(island).not.toBeNull();
    expect(['TROPICAL', 'TEMPERATE']).toContain(island!.biome);
    expect(body).toMatchObject({
      world: String(world.id),
      ownerId: p.playerId,
      ownerName: p.nickname,
      name: 'Koralowa',
      resources: { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 },
      capacity: 2000,
      population: 0,
      populationMax: 100,
      lastSyncAt: '2026-09-08T12:00:00.000Z',
    });
    expect(body.buildings).toMatchObject({ TOWN_HALL: 1, WAREHOUSE: 1, BARRACKS: 0, SHIPYARD: 0 });
    expect(Object.keys(body.buildings as object)).toHaveLength(6);
    const production = body.productionPerHour as Record<string, number>;
    for (const r of island!.biome === 'TROPICAL' ? ['wood', 'food'] : ['stone', 'food']) {
      expect(production[r]).toBeGreaterThan(0);
    }

    const state = await http().get(`/api/v1/worlds/${world.id}/state`).set('Authorization', bearer(p.accessToken)).expect(200);
    expect(state.body.homeSettlement).toEqual({ x: body.x, y: body.y });
  });

  it('powtórny join -> 409; join do świata CLOSED -> 409; join do nieistniejącego -> 404; zła nazwa -> 400', async () => {
    const p = await registerPlayer(app);
    const world = await createWorld(app);
    await joinWorld(app, p.accessToken, world.id);
    await http().post(`/api/v1/worlds/${world.id}/join`).set('Authorization', bearer(p.accessToken)).send({}).expect(409);

    const closed = await createWorld(app, { status: 'CLOSED' });
    await http().post(`/api/v1/worlds/${closed.id}/join`).set('Authorization', bearer(p.accessToken)).send({}).expect(409);
    await http().post('/api/v1/worlds/999999/join').set('Authorization', bearer(p.accessToken)).send({}).expect(404);

    const q = await registerPlayer(app);
    await http().post(`/api/v1/worlds/${world.id}/join`).set('Authorization', bearer(q.accessToken)).send({ name: 'x'.repeat(33) }).expect(400);
  });

  it('dwóch graczy dostaje różne wyspy, obie blisko środka', async () => {
    const world = await createWorld(app);
    const a = await joinWorld(app, (await registerPlayer(app)).accessToken, world.id);
    const b = await joinWorld(app, (await registerPlayer(app)).accessToken, world.id);
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
    for (const s of [a, b]) {
      expect(Math.abs(s.x - 100)).toBeLessThan(70);
      expect(Math.abs(s.y - 100)).toBeLessThan(70);
    }
  });
```

Dodaj na górze `test/worlds.e2e-spec.ts` importy `import { islandAt } from '../src/domain/geography/index.js';` i `joinWorld` z fixtures.

`test/settlements.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { bearer, createWorld, joinWorld, registerPlayer } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('settlements (e2e) — reguły informacyjne', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    app = await createTestApp({ clock });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('bez bbox: tylko własne osady, w pełni', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const other = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id, 'Moja');
    await joinWorld(app, other.accessToken, world.id, 'Cudza');

    const res = await http().get(`/api/v1/worlds/${world.id}/settlements`).set('Authorization', bearer(me.accessToken)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ x: mine.x, y: mine.y, name: 'Moja', ownerName: me.nickname });
    expect(res.body[0].resources).toBeDefined();
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('z bbox: własna z resources, cudza bez klucza resources, obie z ownerName', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const other = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id, 'Moja');
    const theirs = await joinWorld(app, other.accessToken, world.id, 'Cudza');

    const around = (c: { x: number; y: number }) =>
      `${Math.max(0, c.x - 3)},${Math.max(0, c.y - 3)},${Math.min(199, c.x + 3)},${Math.min(199, c.y + 3)}`;
    const resMine = await http().get(`/api/v1/worlds/${world.id}/settlements`).query({ bbox: around(mine) }).set('Authorization', bearer(me.accessToken)).expect(200);
    const resTheirs = await http().get(`/api/v1/worlds/${world.id}/settlements`).query({ bbox: around(theirs) }).set('Authorization', bearer(me.accessToken)).expect(200);
    const own = resMine.body.find((s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y);
    const foreign = resTheirs.body.find((s: { x: number; y: number }) => s.x === theirs.x && s.y === theirs.y);
    expect(own.resources).toEqual({ wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 });
    expect(own.ownerName).toBe(me.nickname);
    expect(foreign).toEqual({
      world: String(world.id),
      x: theirs.x,
      y: theirs.y,
      ownerId: other.playerId,
      ownerName: other.nickname,
      name: 'Cudza',
    });
    expect('resources' in foreign).toBe(false);
  });

  it('zasoby rosną leniwie bez zapisu: po godzinie odczyt pokazuje produkcję, lastSyncAt = now', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    await joinWorld(app, me.accessToken, world.id);
    clock.advance(3600_000);
    const res = await http().get(`/api/v1/worlds/${world.id}/settlements`).set('Authorization', bearer(me.accessToken)).expect(200);
    const s = res.body[0];
    expect(s.resources.food).toBe(1000 + s.productionPerHour.food);
    expect(s.lastSyncAt).toBe(clock.now().toISOString());
    clock.advance(-3600_000);
  });

  it('bbox > 4096 komórek albo poza mapą -> 400; bez profilu -> 403', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    await joinWorld(app, me.accessToken, world.id);
    await http().get(`/api/v1/worlds/${world.id}/settlements`).query({ bbox: '0,0,64,63' }).set('Authorization', bearer(me.accessToken)).expect(400);
    await http().get(`/api/v1/worlds/${world.id}/settlements`).query({ bbox: '0,0,10,200' }).set('Authorization', bearer(me.accessToken)).expect(400);
    const stranger = await registerPlayer(app);
    await http().get(`/api/v1/worlds/${world.id}/settlements`).set('Authorization', bearer(stranger.accessToken)).expect(403);
  });
});
```

- [ ] **Step 6: Uruchom e2e i potwierdź porażkę**

Run: `npm run test:e2e -- test/worlds.e2e-spec.ts test/settlements.e2e-spec.ts`
Expected: FAIL — `POST /worlds/:id/join` zwraca 404.

- [ ] **Step 7: Serwis `join`, DTO, kontroler, moduł**

W `src/modules/worlds/worlds.dto.ts` dodaj:

```ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

export class JoinWorldDto {
  @ApiPropertyOptional({ example: 'Koralowa', minLength: 1, maxLength: 32, description: 'Domyślnie „Osada”' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32)
  name?: string;
}
```

W `src/modules/worlds/worlds.service.ts` rozszerz konstruktor i dodaj `join`:

```ts
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { STARTER_PACK, startingBuildings } from '../../domain/balance/index.js';
import type { Clock } from '../../domain/time/index.js';
import { DB, type Db } from '../../infra/db/db.module.js';
import { isUniqueViolation } from '../../infra/db/pg-errors.js';
import { CLOCK } from '../../infra/time/time.module.js';
import { type OwnSettlementView, ownView } from '../settlements/settlement-views.js';
import { SettlementsRepository } from '../settlements/settlements.repository.js';
import { pickHomeIsland } from './home-island-picker.js';
import { coordKey } from '../settlements/bbox.js';

const JOIN_ATTEMPTS = 3;
const DEFAULT_SETTLEMENT_NAME = 'Osada';

@Injectable()
export class WorldsService {
  constructor(
    private readonly worlds: WorldsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly settlements: SettlementsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // list(), state(), create() bez zmian z Task 12

  /** Zakłada profil i osadę domową w jednej transakcji; powtarza losowanie po konflikcie klucza osady. */
  async join(worldId: number, playerId: number, name?: string): Promise<OwnSettlementView> {
    const world = await this.worlds.findById(worldId);
    if (!world) {
      throw new NotFoundException('Świat nie istnieje');
    }
    if (world.status !== 'OPEN') {
      throw new ConflictException('Świat nie przyjmuje nowych graczy');
    }
    if (await this.profiles.find(worldId, playerId)) {
      throw new ConflictException('Masz już profil na tym świecie');
    }
    const settlementName = name ?? DEFAULT_SETTLEMENT_NAME;

    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt++) {
      const taken = await this.settlements.listCoords(worldId);
      const pick = pickHomeIsland(world, (x, y) => taken.has(coordKey(x, y)), (n) => randomInt(n));
      if (!pick) {
        throw new ConflictException('Świat jest pełny: brak wolnej wyspy na osadę domową');
      }
      const now = this.clock.now();
      try {
        await this.db.transaction(async (tx) => {
          await this.profiles.create(tx, { worldId, playerId, homeX: pick.x, homeY: pick.y });
          await this.settlements.insertWithBuildings(tx, {
            worldId,
            x: pick.x,
            y: pick.y,
            ownerId: playerId,
            name: settlementName,
            biome: pick.biome,
            resources: STARTER_PACK,
            lastSyncAt: now,
            buildings: startingBuildings(pick.biome),
          });
        });
      } catch (err) {
        if (isUniqueViolation(err, 'settlements_pk')) continue; // ktoś wziął tę wyspę w międzyczasie
        if (isUniqueViolation(err, 'profiles_pk')) throw new ConflictException('Masz już profil na tym świecie');
        throw err;
      }
      const record = await this.settlements.findOne(worldId, pick.x, pick.y);
      if (!record) throw new Error('Osada domowa zniknęła tuż po założeniu');
      return ownView(record, now);
    }
    throw new ConflictException('Nie udało się wylosować wolnej wyspy, spróbuj ponownie');
  }
```

W `worlds.controller.ts` dodaj:

```ts
  @Post(':id/join')
  @HttpCode(201)
  @ApiCreatedResponse({ type: SettlementDto, description: 'Osada domowa (pełny widok) + serverTime' })
  @ApiConflictResponse({ description: 'Już dołączyłeś, świat nie jest OPEN albo jest pełny' })
  @ApiNotFoundResponse({ description: 'Świat nie istnieje' })
  join(
    @Param('id', new ParseIntPipe({ errorHttpStatusCode: 404 })) worldId: number,
    @CurrentPlayer() playerId: number,
    @Body() dto: JoinWorldDto,
  ): Promise<SettlementDto> {
    return this.service.join(worldId, playerId, dto.name);
  }
```

z importami `Body, HttpCode, Param, ParseIntPipe, Post` z `@nestjs/common`, `ApiConflictResponse, ApiCreatedResponse` ze swaggera, `SettlementDto` z `../settlements/settlements.dto.js`, `JoinWorldDto` z `./worlds.dto.js`.

W `worlds.module.ts` dodaj `imports: [forwardRef(() => SettlementsModule)]` i w `settlements.module.ts` zamień `imports: [WorldsModule]` na `imports: [forwardRef(() => WorldsModule)]` (moduły odwołują się do siebie: `WorldsService` potrzebuje `SettlementsRepository`, a `SettlementsController` potrzebuje `ProfileGuard`). Import `forwardRef` z `@nestjs/common`.

Nazwy `settlements_pk` i `profiles_pk` używane w `join` pochodzą z jawnych nazw kluczy głównych nadanych w Task 4. Potwierdź: `grep -n "settlements_pk\|profiles_pk" drizzle/0001_initial_schema.sql` zwraca dwie linie.

- [ ] **Step 8: Uruchom wszystko**

Run: `npm test && npm run test:e2e`
Expected: PASS — w tym 3 nowe testy w `worlds.e2e-spec.ts` i 4 w `settlements.e2e-spec.ts`.

- [ ] **Step 9: Commit**

```bash
npm run lint && npm run build && git add -A && git commit -m "Add world join with home island picker and settlement reads with information rules"
```

---

## Task 15: Floty — odczyt własnych i nadchodzących

**Files:**
- Create: `src/modules/fleets/fleets.repository.ts`, `src/modules/fleets/fleet-views.ts`, `src/modules/fleets/fleet-views.spec.ts`, `src/modules/fleets/fleets.controller.ts`, `src/modules/fleets/fleets.dto.ts`, `test/fleets.e2e-spec.ts`
- Modify: `src/modules/fleets/fleets.module.ts`

**Interfaces:**
- Consumes: Task 4 (`fleets`, `settlements`, `players`), Task 12 (`ProfileGuard`).
- Produces: `interface FleetRecord { id: string; worldId: number; ownerId: number; ownerName: string; mission: Mission; fromX; fromY; toX; toY; ships: Record<string, number>; cargo: FleetCargo; departAt: Date; arriveAt: Date }`; `FleetsRepository.listVisible(worldId, playerId)`; `ownFleetView(f)`, `incomingFleetView(f)`, `fleetViewFor(f, requesterId)`.

- [ ] **Step 1: Napisz test jednostkowy widoków**

`src/modules/fleets/fleet-views.spec.ts`:

```ts
import { fleetViewFor, incomingFleetView, ownFleetView, type FleetRecord } from './fleet-views.js';

const fleet: FleetRecord = {
  id: 'f3',
  worldId: 1,
  ownerId: 7,
  ownerName: 'sebastian',
  mission: 'ATTACK',
  fromX: 10,
  fromY: 15,
  toX: 14,
  toY: 9,
  ships: { SLOOP: 10, GALLEON: 2 },
  cargo: { units: { MILITIA: 20 }, resources: { iron: 300 } },
  departAt: new Date('2026-09-08T12:00:00.000Z'),
  arriveAt: new Date('2026-09-08T12:40:00.000Z'),
};

describe('widoki floty', () => {
  it('ownFleetView: kształt z sekcji 4.3 specu klienta', () => {
    expect(ownFleetView(fleet)).toEqual({
      id: 'f3',
      world: '1',
      ownerId: 7,
      ownerName: 'sebastian',
      mission: 'ATTACK',
      from: { x: 10, y: 15 },
      to: { x: 14, y: 9 },
      ships: { SLOOP: 10, GALLEON: 2 },
      cargo: { units: { MILITIA: 20 }, resources: { iron: 300 } },
      departAt: '2026-09-08T12:00:00.000Z',
      arriveAt: '2026-09-08T12:40:00.000Z',
    });
  });

  it('incomingFleetView: bez ships i cargo, z departAt (Incoming Fleet ze słownika)', () => {
    const view = incomingFleetView(fleet);
    expect(view).toEqual({
      id: 'f3',
      world: '1',
      ownerId: 7,
      ownerName: 'sebastian',
      mission: 'ATTACK',
      from: { x: 10, y: 15 },
      to: { x: 14, y: 9 },
      departAt: '2026-09-08T12:00:00.000Z',
      arriveAt: '2026-09-08T12:40:00.000Z',
    });
    expect('ships' in view).toBe(false);
    expect('cargo' in view).toBe(false);
  });

  it('fleetViewFor: właściciel pełny, cel okrojony', () => {
    expect('ships' in fleetViewFor(fleet, 7)).toBe(true);
    expect('ships' in fleetViewFor(fleet, 9)).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/modules/fleets`
Expected: FAIL — brak modułu.

- [ ] **Step 3: Widoki, repozytorium, kontroler, moduł**

`src/modules/fleets/fleet-views.ts`:

```ts
import type { FleetCargo } from '../../infra/db/schema/index.js';

export type Mission = 'COLONIZE' | 'ATTACK' | 'TRANSPORT' | 'EXPEDITION' | 'RETURN';

export interface FleetRecord {
  id: string;
  worldId: number;
  ownerId: number;
  ownerName: string;
  mission: Mission;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  ships: Record<string, number>;
  cargo: FleetCargo;
  departAt: Date;
  arriveAt: Date;
}

/** Incoming Fleet ze słownika: właściciel, misja, trasa i czasy — nigdy statki ani ładunek. */
export interface IncomingFleetView {
  id: string;
  world: string;
  ownerId: number;
  ownerName: string;
  mission: Mission;
  from: { x: number; y: number };
  to: { x: number; y: number };
  departAt: string;
  arriveAt: string;
}

export interface OwnFleetView extends IncomingFleetView {
  ships: Record<string, number>;
  cargo: FleetCargo;
}

export function incomingFleetView(f: FleetRecord): IncomingFleetView {
  return {
    id: f.id,
    world: String(f.worldId),
    ownerId: f.ownerId,
    ownerName: f.ownerName,
    mission: f.mission,
    from: { x: f.fromX, y: f.fromY },
    to: { x: f.toX, y: f.toY },
    departAt: f.departAt.toISOString(),
    arriveAt: f.arriveAt.toISOString(),
  };
}

export function ownFleetView(f: FleetRecord): OwnFleetView {
  return { ...incomingFleetView(f), ships: f.ships, cargo: f.cargo };
}

export function fleetViewFor(f: FleetRecord, requesterId: number): OwnFleetView | IncomingFleetView {
  return f.ownerId === requesterId ? ownFleetView(f) : incomingFleetView(f);
}
```

`src/modules/fleets/fleets.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, isNull, or } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { fleets, players, settlements } from '../../infra/db/schema/index.js';
import type { FleetRecord } from './fleet-views.js';

@Injectable()
export class FleetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Nierozstrzygnięte floty gracza oraz cudze ATTACK, których celem jest osada gracza. */
  listVisible(worldId: number, playerId: number): Promise<FleetRecord[]> {
    const targetsMine = exists(
      this.db
        .select({ x: settlements.x })
        .from(settlements)
        .where(
          and(
            eq(settlements.worldId, fleets.worldId),
            eq(settlements.x, fleets.toX),
            eq(settlements.y, fleets.toY),
            eq(settlements.ownerId, playerId),
          ),
        ),
    );
    return this.db
      .select({
        id: fleets.id,
        worldId: fleets.worldId,
        ownerId: fleets.ownerId,
        ownerName: players.nickname,
        mission: fleets.mission,
        fromX: fleets.fromX,
        fromY: fleets.fromY,
        toX: fleets.toX,
        toY: fleets.toY,
        ships: fleets.ships,
        cargo: fleets.cargo,
        departAt: fleets.departAt,
        arriveAt: fleets.arriveAt,
      })
      .from(fleets)
      .innerJoin(players, eq(players.id, fleets.ownerId))
      .where(
        and(
          eq(fleets.worldId, worldId),
          isNull(fleets.resolvedAt),
          or(eq(fleets.ownerId, playerId), and(eq(fleets.mission, 'ATTACK'), targetsMine)),
        ),
      )
      .orderBy(asc(fleets.arriveAt));
  }
}
```

`src/modules/fleets/fleets.dto.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class VectorDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
}

/** Cudza nadchodząca flota nie ma `ships` ani `cargo`. */
export class FleetDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '1' }) world!: string;
  @ApiProperty() ownerId!: number;
  @ApiProperty() ownerName!: string;
  @ApiProperty({ enum: ['COLONIZE', 'ATTACK', 'TRANSPORT', 'EXPEDITION', 'RETURN'] }) mission!: string;
  @ApiProperty({ type: VectorDto }) from!: VectorDto;
  @ApiProperty({ type: VectorDto }) to!: VectorDto;
  @ApiProperty() departAt!: string;
  @ApiProperty() arriveAt!: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'number' } }) ships?: Record<string, number>;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true }) cargo?: object;
}
```

`src/modules/fleets/fleets.controller.ts`:

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ProfileGuard, type WorldRequest } from '../worlds/profile.guard.js';
import { fleetViewFor } from './fleet-views.js';
import { FleetDto } from './fleets.dto.js';
import { FleetsRepository } from './fleets.repository.js';

@ApiTags('fleets')
@ApiBearerAuth()
@Controller('worlds/:id/fleets')
@UseGuards(ProfileGuard)
export class FleetsController {
  constructor(private readonly fleets: FleetsRepository) {}

  @Get()
  @ApiOkResponse({ type: [FleetDto] })
  async list(@Req() req: WorldRequest): Promise<FleetDto[]> {
    const rows = await this.fleets.listVisible(req.world.id, req.playerId);
    return rows.map((f) => fleetViewFor(f, req.playerId));
  }
}
```

`src/modules/fleets/fleets.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { FleetsController } from './fleets.controller.js';
import { FleetsRepository } from './fleets.repository.js';

@Module({
  imports: [WorldsModule],
  controllers: [FleetsController],
  providers: [FleetsRepository],
  exports: [FleetsRepository],
})
export class FleetsModule {}
```

- [ ] **Step 4: Test e2e**

`test/fleets.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { fleets } from '../src/infra/db/schema/index.js';
import { bearer, createWorld, joinWorld, registerPlayer } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('fleets (e2e)', () => {
  let app: INestApplication;
  let db: Db;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get<Db>(DB);
  });
  afterAll(async () => {
    await app.close();
  });

  it('widzi własne floty w pełni i cudze ATTACK na swoje osady bez ships/cargo; cudzy TRANSPORT jest niewidoczny', async () => {
    const world = await createWorld(app);
    const me = await registerPlayer(app);
    const enemy = await registerPlayer(app);
    const mine = await joinWorld(app, me.accessToken, world.id);
    const theirs = await joinWorld(app, enemy.accessToken, world.id);
    const departAt = new Date('2026-09-08T12:00:00.000Z');
    const arriveAt = new Date('2026-09-08T12:40:00.000Z');

    await db.insert(fleets).values([
      {
        worldId: world.id, ownerId: me.playerId, mission: 'EXPEDITION',
        fromX: mine.x, fromY: mine.y, toX: mine.x + 3, toY: mine.y + 3,
        ships: { SLOOP: 4 }, cargo: { units: {}, resources: {} }, departAt, arriveAt,
      },
      {
        worldId: world.id, ownerId: enemy.playerId, mission: 'ATTACK',
        fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y,
        ships: { GALLEON: 2 }, cargo: { units: { MILITIA: 20 }, resources: {} }, departAt, arriveAt,
      },
      {
        worldId: world.id, ownerId: enemy.playerId, mission: 'TRANSPORT',
        fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y,
        ships: { SLOOP: 1 }, cargo: { units: {}, resources: { wood: 10 } }, departAt, arriveAt,
      },
      {
        worldId: world.id, ownerId: enemy.playerId, mission: 'ATTACK',
        fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y,
        ships: { GALLEON: 1 }, cargo: { units: {}, resources: {} }, departAt, arriveAt, resolvedAt: arriveAt,
      },
    ]);

    const res = await request(app.getHttpServer()).get(`/api/v1/worlds/${world.id}/fleets`).set('Authorization', bearer(me.accessToken)).expect(200);
    expect(res.body).toHaveLength(2);
    const own = res.body.find((f: { mission: string }) => f.mission === 'EXPEDITION');
    const incoming = res.body.find((f: { mission: string }) => f.mission === 'ATTACK');
    expect(own).toMatchObject({ ownerId: me.playerId, ownerName: me.nickname, ships: { SLOOP: 4 }, world: String(world.id) });
    expect(incoming).toEqual({
      id: expect.any(String),
      world: String(world.id),
      ownerId: enemy.playerId,
      ownerName: enemy.nickname,
      mission: 'ATTACK',
      from: { x: theirs.x, y: theirs.y },
      to: { x: mine.x, y: mine.y },
      departAt: '2026-09-08T12:00:00.000Z',
      arriveAt: '2026-09-08T12:40:00.000Z',
    });

    const enemyView = await request(app.getHttpServer()).get(`/api/v1/worlds/${world.id}/fleets`).set('Authorization', bearer(enemy.accessToken)).expect(200);
    expect(enemyView.body).toHaveLength(2);
    expect(enemyView.body.every((f: { ships?: unknown }) => f.ships !== undefined)).toBe(true);
  });
});
```

- [ ] **Step 5: Uruchom testy**

Run: `npx vitest run src/modules/fleets && npm run test:e2e -- test/fleets.e2e-spec.ts`
Expected: PASS (3 jednostkowe, 1 e2e).

- [ ] **Step 6: Commit**

```bash
npm run lint && npm run build && git add -A && git commit -m "Add fleet reads with owner and incoming views"
```

---

## Task 16: `X-Server-Time` i `serverTime`, filtr wyjątków, limity zapytań

**Files:**
- Create: `src/infra/http/server-time.middleware.ts`, `src/infra/http/server-time.interceptor.ts`, `src/infra/http/server-time.interceptor.spec.ts`, `src/infra/http/all-exceptions.filter.ts`, `src/infra/http/rate-limit.guard.ts`, `src/infra/http/rate-limit.guard.spec.ts`, `src/infra/http/http.module.ts`, `test/http.e2e-spec.ts`
- Modify: `src/app.module.ts`, `src/infra/http/configure-app.ts` (middleware), `src/modules/auth/auth.controller.ts` (dekoratory `@RateLimit`)

**Interfaces:**
- Consumes: `CLOCK`, `Clock`, `FixedClock` (Task 10).
- Produces: `serverTimeMiddleware(clock)` (nagłówek na każdej odpowiedzi, także błędach i 404), `ServerTimeInterceptor` (pole `serverTime` w obiektach), `AllExceptionsFilter`, `RateLimitGuard`, `@RateLimit('ip' | 'player')`, `HttpModule`. Limity z env: `RATE_LIMIT_AUTH_PER_MINUTE` dla `keyBy: 'ip'`, `RATE_LIMIT_PLAYER_PER_MINUTE` dla tras uwierzytelnionych; okno zawsze 60 s.

- [ ] **Step 1: Napisz testy jednostkowe**

`src/infra/http/server-time.interceptor.spec.ts`:

```ts
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { FixedClock } from '../../domain/time/index.js';
import { ServerTimeInterceptor } from './server-time.interceptor.js';

import { serverTimeMiddleware } from './server-time.middleware.js';

const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

function run(body: unknown) {
  const ctx = {} as ExecutionContext;
  const next = { handle: () => of(body) } as CallHandler;
  return lastValueFrom(new ServerTimeInterceptor(clock).intercept(ctx, next));
}

describe('ServerTimeInterceptor', () => {
  it('dokłada pole serverTime do odpowiedzi-obiektu', async () => {
    expect(await run({ id: '1' })).toEqual({ id: '1', serverTime: '2026-09-08T12:00:00.000Z' });
  });

  it('tablice, null, undefined i tekst zostają nietknięte', async () => {
    for (const body of [[{ id: '1' }], null, undefined, 'tekst']) {
      expect(await run(body)).toEqual(body);
    }
  });
});

describe('serverTimeMiddleware', () => {
  it('ustawia X-Server-Time i przekazuje dalej', () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
    let called = false;
    serverTimeMiddleware(clock)({} as never, res as never, () => (called = true));
    expect(headers['X-Server-Time']).toBe('2026-09-08T12:00:00.000Z');
    expect(called).toBe(true);
  });
});
```

`src/infra/http/rate-limit.guard.spec.ts`:

```ts
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FixedClock } from '../../domain/time/index.js';
import type { Env } from '../config/env.js';
import { RATE_LIMIT, RateLimitGuard, type RateLimitKey } from './rate-limit.guard.js';

const env = { RATE_LIMIT_AUTH_PER_MINUTE: 10, RATE_LIMIT_PLAYER_PER_MINUTE: 120 } as Env;

function context(req: Record<string, unknown>, handler: object, cls: object = class C {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));
  const guard = () => new RateLimitGuard(new Reflector(), clock, env);

  it('trasa publiczna bez metadanych: bez limitu', () => {
    const g = guard();
    const handler = function open() {};
    for (let i = 0; i < 500; i++) expect(g.canActivate(context({ ip: '1.1.1.1' }, handler))).toBe(true);
  });

  it('trasa z playerId: domyślnie 120/min na gracza, 121. żądanie -> 429, po oknie znów wolno', () => {
    const g = guard();
    const handler = function state() {};
    for (let i = 0; i < 120; i++) expect(g.canActivate(context({ playerId: 7, ip: '1.1.1.1' }, handler))).toBe(true);
    expect(() => g.canActivate(context({ playerId: 7, ip: '1.1.1.1' }, handler))).toThrow(HttpException);
    expect(g.canActivate(context({ playerId: 8, ip: '1.1.1.1' }, handler))).toBe(true);
    clock.advance(60_001);
    expect(g.canActivate(context({ playerId: 7, ip: '1.1.1.1' }, handler))).toBe(true);
  });

  it('metadane @RateLimit po IP: 10/min na trasę, osobno dla różnych IP i tras', () => {
    const g = guard();
    const login = function login() {};
    const register = function register() {};
    const key: RateLimitKey = 'ip';
    Reflect.defineMetadata(RATE_LIMIT, key, login);
    Reflect.defineMetadata(RATE_LIMIT, key, register);
    for (let i = 0; i < 10; i++) expect(g.canActivate(context({ ip: '2.2.2.2' }, login))).toBe(true);
    let status = 0;
    try {
      g.canActivate(context({ ip: '2.2.2.2' }, login));
    } catch (e) {
      status = (e as HttpException).getStatus();
    }
    expect(status).toBe(429);
    expect(g.canActivate(context({ ip: '3.3.3.3' }, login))).toBe(true);
    expect(g.canActivate(context({ ip: '2.2.2.2' }, register))).toBe(true);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/infra/http`
Expected: FAIL — brak modułów.

- [ ] **Step 3: Zaimplementuj interceptor, filtr, strażnik, moduł**

`src/infra/http/server-time.interceptor.ts`:

```ts
import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { Clock } from '../../domain/time/index.js';
import { CLOCK } from '../time/time.module.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** Pole `serverTime` tylko w odpowiedziach-obiektach; tablice zostają tablicami (klient parsuje listy jako Array). */
@Injectable()
export class ServerTimeInterceptor implements NestInterceptor {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const serverTime = this.clock.now().toISOString();
    return next.handle().pipe(map((body: unknown) => (isPlainObject(body) ? { ...body, serverTime } : body)));
  }
}
```

`src/infra/http/server-time.middleware.ts`:

```ts
import type { NextFunction, Request, Response } from 'express';
import type { Clock } from '../../domain/time/index.js';

/**
 * Nagłówek na KAŻDEJ odpowiedzi, także 401 ze strażnika i 404 bez trasy — interceptory tam nie docierają,
 * bo działają dopiero po strażnikach i tylko na dopasowanych trasach.
 */
export function serverTimeMiddleware(clock: Clock) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Server-Time', clock.now().toISOString());
    next();
  };
}
```

W `configureApp` (Task 2) dodaj przed `app.setGlobalPrefix(...)`:

```ts
  app.use(serverTimeMiddleware(app.get<Clock>(CLOCK)));
```

z importami `import { serverTimeMiddleware } from './server-time.middleware.js';`, `import { CLOCK } from '../time/time.module.js';`, `import type { Clock } from '../../domain/time/index.js';`.

`src/infra/http/all-exceptions.filter.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/** HttpException przechodzi bez zmian; wszystko inne to 500 z identyfikatorem w logu, bez szczegółów dla klienta. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body);
      return;
    }

    const errorId = randomUUID();
    this.logger.error(`[${errorId}] ${req.method} ${req.url}`, exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Błąd serwera',
      errorId,
    });
  }
}
```

`src/infra/http/rate-limit.guard.ts`:

```ts
import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Clock } from '../../domain/time/index.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CLOCK } from '../time/time.module.js';

export type RateLimitKey = 'ip' | 'player';

export const RATE_LIMIT = 'rateLimit';
/** Jawny klucz limitu dla trasy, np. `@RateLimit('ip')` na logowaniu; wartość limitu z env. */
export const RateLimit = (key: RateLimitKey) => SetMetadata(RATE_LIMIT, key);

const WINDOW_MS = 60_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Stałe okno w pamięci procesu (jedna instancja; Redis dojdzie w specu C).
 * Zastępuje @nestjs/throttler, który nie deklaruje zgodności z Nest 12.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly reflector: Reflector,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ playerId?: number; ip?: string }>();
    const explicit = this.reflector.getAllAndOverride<RateLimitKey | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const keyBy: RateLimitKey | null = explicit ?? (req.playerId !== undefined ? 'player' : null);
    if (!keyBy) return true;

    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const byPlayer = keyBy === 'player' && req.playerId !== undefined;
    const key = byPlayer ? `player:${req.playerId}` : `ip:${route}:${req.ip ?? 'unknown'}`;
    const limit = byPlayer ? this.env.RATE_LIMIT_PLAYER_PER_MINUTE : this.env.RATE_LIMIT_AUTH_PER_MINUTE;

    const now = this.clock.now().getTime();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
      this.sweep(now);
    }
    bucket.count++;
    if (bucket.count > limit) {
      throw new HttpException(
        { statusCode: 429, error: 'Too Many Requests', message: 'Za dużo żądań, spróbuj za chwilę' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private sweep(now: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k);
  }
}
```

`src/infra/http/http.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { ServerTimeInterceptor } from './server-time.interceptor.js';

/** Importować PO AuthModule, żeby RateLimitGuard widział `req.playerId` ustawione przez JwtAuthGuard. */
@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ServerTimeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class HttpModule {}
```

W `AppModule.forRoot` dodaj `HttpModule` na **końcu** listy `imports`. W `AuthController` nad `register`, `login` i `refresh` dodaj `@RateLimit('ip')` (import z `../../infra/http/rate-limit.guard.js`).

- [ ] **Step 4: Test e2e**

`test/http.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FixedClock } from '../src/domain/time/index.js';
import { bearer, createWorld, joinWorld, registerPlayer } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('warstwa HTTP (e2e)', () => {
  let app: INestApplication;
  const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

  beforeAll(async () => {
    // limit produkcyjny (10/min), w przeciwieństwie do domyślnego środowiska testowego
    app = await createTestApp({ clock, env: { RATE_LIMIT_AUTH_PER_MINUTE: '10' } });
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('X-Server-Time na każdej odpowiedzi, także 404 i 401; serverTime w state i join, nie w tablicach', async () => {
    const health = await http().get('/api/v1/health').expect(200);
    expect(health.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');
    expect(health.body.serverTime).toBe('2026-09-08T12:00:00.000Z');

    const notFound = await http().get('/api/v1/nie-ma').expect(404);
    expect(notFound.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');
    const unauthorized = await http().get('/api/v1/worlds').expect(401);
    expect(unauthorized.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');

    const p = await registerPlayer(app);
    const world = await createWorld(app);
    const joined = await joinWorld(app, p.accessToken, world.id);
    expect(joined.serverTime).toBe('2026-09-08T12:00:00.000Z');
    const list = await http().get(`/api/v1/worlds/${world.id}/settlements`).set('Authorization', bearer(p.accessToken)).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.headers['x-server-time']).toBe('2026-09-08T12:00:00.000Z');
  });

  it('login ograniczony do 10 na minutę na IP -> 429, po minucie znów działa', async () => {
    const p = await registerPlayer(app);
    for (let i = 0; i < 10; i++) {
      await http().post('/api/v1/auth/login').send({ email: p.email, password: 'zle' }).expect(401);
    }
    const limited = await http().post('/api/v1/auth/login').send({ email: p.email, password: p.password }).expect(429);
    expect(limited.body.message).toMatch(/Za dużo żądań/);
    clock.advance(60_001);
    await http().post('/api/v1/auth/login').send({ email: p.email, password: p.password }).expect(200);
    clock.advance(-60_001);
  });

  it('koperta błędów Nest dla 400 i 409', async () => {
    const res = await http().post('/api/v1/auth/register').send({}).expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });
});
```

Uwaga: ten plik ma limit auth ustawiony na 10 (jak w produkcji), więc `registerPlayer` może tu wystąpić najwyżej 10 razy na minutę zegara; pozostałe pliki e2e mają limit podniesiony przez `createTestApp` i nie dotykają tego zachowania.

- [ ] **Step 5: Uruchom wszystko**

Run: `npm test && npm run test:e2e`
Expected: PASS — wszystkie zestawy. Wklej podsumowanie liczb testów.

- [ ] **Step 6: Commit**

```bash
npm run lint && npm run build && git add -A && git commit -m "Add server time header and field, exception filter and in-memory rate limiting"
```

---

## Task 17: Domknięcie — odstępstwa w specu, README, pełny przebieg

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-backend-foundation-geography-design.md` (sekcja 4), `README.md`

- [ ] **Step 1: Nanieś odstępstwa do specu**

W sekcji 4 specu:

- zamień `- \`@nestjs/config\` z walidacją przez \`zod\`. Zmienne:` na `- Własny \`AppConfigModule\` (token \`ENV\`) z walidacją przez \`zod\`; bez \`@nestjs/config\`. Zmienne:`;
- w liście bibliotek zamień `\`@nestjs/throttler\`, \`@nestjs/terminus\`,` na `własny \`RateLimitGuard\` (bo \`@nestjs/throttler\` 6.5 nie deklaruje zgodności z Nest 12), health przez \`SELECT 1\` bez \`@nestjs/terminus\`,`;
- w sekcji 10.5 zamień pierwszą linię na `Własny \`RateLimitGuard\` (stałe okno w pamięci procesu; Redis dojdzie w C):`.

Sprawdź: `grep -n "throttler\|terminus\|@nestjs/config" docs/superpowers/specs/2026-09-08-backend-foundation-geography-design.md` pokazuje wyłącznie linie z wyjaśnieniem odstępstwa.

- [ ] **Step 2: Przepisz README**

Zastąp całą treść `README.md`:

````markdown
# Islanders API

Backend gry Islanders (NestJS 12, PostgreSQL, Drizzle). Kontrakt i decyzje: `docs/api-guidelines.md`,
`docs/superpowers/specs/`, `docs/adr/`. Słownik domeny: `../islanders/CONTEXT.md`.

## Start lokalny

```bash
npm install
cp .env.example .env            # uzupełnij JWT_SECRET (min. 32 znaki)
npm run compose:up              # Postgres 17 i Redis 7
npm run db:migrate
npm run world:create -- --seed 1337 --wind 0.3,-0.1
npm run start:dev               # http://localhost:3000/api/v1, Swagger: http://localhost:3000/api/docs
```

## Testy

```bash
npm test                        # jednostkowe, w tym parity z ../islanders/contract/world-parity.json
npm run test:e2e                # HTTP na Postgresie z Testcontainers (wymaga Dockera)
```

Test parity czyta plik z repozytorium klienta (`ISLANDERS_CLIENT_DIR`, domyślnie `../islanders`)
i pada, gdy pliku nie ma. Nie dodawaj tolerancji i nie regeneruj pliku, żeby przeszedł —
rozbieżność oznacza rozjazd kontraktu klient–serwer (patrz `contract/README.md` u klienta).

## Migracje

```bash
npm run db:generate             # po zmianie src/infra/db/schema/*
npm run db:migrate
```
````

- [ ] **Step 3: Pełny przebieg i commit**

```bash
npm run lint && npm run build && npm test && npm run test:e2e
git add -A && git commit -m "Record spec deviations and replace starter README"
```

Expected: wszystkie zestawy zielone; wklej ostatnie linie każdego przebiegu.

---

## Samokontrola planu (wykonana przy pisaniu)

**Pokrycie specu:** Etap 0 → Task 1–3; sekcja 5 geografia → Task 5–7; sekcja 6 reguły/balans/ekonomia → Task 8–10; sekcja 7 model danych → Task 4 (+ `replaced_by_id` w Task 11, nazwy PK w Task 14); sekcja 8 auth → Task 11; sekcja 9 światy i join → Task 12, 14; sekcja 10 odczyty, czas, limity → Task 13, 15, 16; sekcja 11 błędy → Task 16; sekcja 12 testy → rozłożone w zadaniach; sekcja 13 kolejność → zachowana; sekcja 14 (praca klienta) → poza planem, celowo.

**Znane uproszczenia względem specu, do potwierdzenia przez wykonawcę:** limit 120/min na gracza pokryty testem jednostkowym, nie e2e (120 żądań HTTP w teście nie wnosi nic ponad test jednostkowy).
