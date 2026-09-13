# Etap 1: monorepo i usługa auth — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repozytorium staje się monorepo (npm workspaces) z pakietami `@islanders/domain`, `@islanders/contracts`, `@islanders/platform`, dotychczasowym kodem jako `apps/core` bez zmiany zachowania oraz nową, samodzielną usługą `apps/auth` wydającą tokeny EdDSA weryfikowalne przez JWKS.

**Architecture:** Kod gry przenosimy `git mv` do `apps/core`. Wspólna infrastruktura Nest trafia do `packages/platform`, a pliki `apps/core/src/infra/**` zostają jako cienkie re-eksporty, żeby moduły core nie zmieniały importów. Czysta domena (bez geografii) trafia do `packages/domain` z eksportami podścieżek (`@islanders/domain/rules` itd.). `apps/auth` to nowa aplikacja Nest z dwoma serwerami HTTP na jednej instancji Express (publiczny i wewnętrzny), rozróżnianymi middlewarem zakresu portu.

**Tech Stack:** Node 24, npm workspaces, NestJS 12 (ESM, importy z `.js`), TypeScript 6, Vitest 4, Drizzle ORM 0.45 + postgres.js + drizzle-kit 0.31, PostgreSQL 17, Redis 7 (ioredis), zod 4, argon2, `jose` 6, Testcontainers, supertest.

**Spec:** `docs/superpowers/specs/2026-09-13-stage-1-monorepo-and-auth-design.md` (nadrzędny: `docs/superpowers/specs/2026-09-13-architecture-split-design.md`, architektura: `docs/architecture.md`).

## Global Constraints

- Po każdym zadaniu `npm test` i `npm run test:e2e` w korzeniu są zielone (e2e wymaga Dockera).
- `apps/core` nie zmienia zachowania HTTP poza trzema świadomymi zmianami z zadania 4: limiter na Redisie, globalny limit po adresie przed uwierzytelnieniem, `TRUST_PROXY` jako liczba/lista podsieci; oraz zmianą nazwy zmiennej `RATE_LIMIT_PLAYER_PER_MINUTE` → `RATE_LIMIT_SUBJECT_PER_MINUTE`.
- `packages/domain` i `packages/contracts` nie importują `@nestjs/*`, `drizzle-orm`, `postgres`, `ioredis`.
- Pakiety budowane `tsc -p tsconfig.build.json` do `dist`; `exports` wskazuje `dist`. Aplikacje wymagają zbudowanych pakietów (`npm run build:packages`).
- Importy względne w ESM zawsze z rozszerzeniem `.js`.
- Access token gracza: EdDSA (Ed25519), `iss = AUTH_ISSUER`, `aud = islanders-worlds`, TTL `JWT_ACCESS_TTL` (domyślnie `15m`).
- Token tools: `aud = islanders-tools`, 1 h, tylko rola `admin`. Token serwisowy: `aud = islanders-internal`, 5 min, `sub = service:core:<slug>`.
- Okno łaski refresh tokenu: 60 s (`REFRESH_GRACE_MS = 60_000`), semantyka ze specu A §8 bez zmian.
- Slug świata: `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–40 znaków. Partia zdarzeń: 1–100.
- Role: `player`, `tester`, `admin`; `player` zawsze obecna i nieusuwalna.
- Auth: port publiczny `PORT` (domyślnie 3000), wewnętrzny `ADMIN_PORT` (domyślnie 3001). Trasy `/internal/*` i `/health/*` wyłącznie na porcie wewnętrznym; `/.well-known/jwks.json` na obu.
- Auth nie ma globalnego prefiksu: kontrolery deklarują `v1/...`, `internal/v1/...`, `health`, `.well-known`.
- Komunikaty dla użytkownika po polsku, kod i identyfikatory po angielsku, komentarze po polsku (styl repozytorium).
- Limiter przy niedostępnym Redisie przepuszcza ruch (fail-open) po 200 ms i loguje ostrzeżenie.
- Commit po każdym zadaniu, stopka commita:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012Gmq9cXiWE6LbwKND9QnWN
  ```

## Struktura plików po etapie

```
package.json                     workspaces + skrypty zbiorcze
tsconfig.base.json
oxlint.json .prettierrc .gitignore
docker-compose.yml
docker/postgres-init.sql
packages/
  domain/      src/{rules,balance,economy,time}/…            @islanders/domain/<podścieżka>
  contracts/   src/{slug,claims,worlds,events,errors,index}.ts
  platform/    src/config/{env,config.module}.ts
               src/db/{db.module,migrate,pg-errors,citext,advisory-lock}.ts
               src/http/{all-exceptions.filter,server-time.middleware,server-time.interceptor,
                         configure-app,port-scope,internal-listener}.ts
               src/rate-limit/{window,rate-limiter,rate-limit.guard,ip-rate-limit.middleware,rate-limit.module}.ts
               src/redis/redis.module.ts  src/swagger/setup-swagger.ts  src/time/time.module.ts
               src/health/health.module.ts  src/util/with-timeout.ts  src/index.ts
apps/
  core/        dotychczasowe src/, test/, drizzle/ (src/infra/** jako re-eksporty z platform)
  auth/        src/config/env.ts  src/db/{db,schema/*}.ts  src/app.module.ts  src/main.ts
               src/keys/{signing-keys,generate-signing-key}.ts
               src/tokens/{token-issuer,token-verifier,jwks.controller,tokens.module,guards}.ts
               src/accounts/{accounts.repository,refresh-tokens.repository,refresh-tokens,auth.service,
                             auth.controller,auth.dto,accounts-admin,accounts.module}.ts
               src/service-clients/{service-clients,generate-service-client,internal-token.controller}.ts
               src/worlds/{worlds.repository,worlds.controller,internal-worlds.controller,worlds.module}.ts
               src/events/{events.service,internal-events.controller}.ts
               src/probe/{world-probe,world-probe.scheduler}.ts
               src/common/zod.pipe.ts
               src/cli/{migrate,accounts,keys-generate,client-create}.ts
               test/support/{global-setup,test-app,keys,fixtures,vitest.d}.ts  test/*.e2e-spec.ts
```

---

### Task 0: Gałąź robocza z połączeniem Redisa

Połączenie z Redisem (`ef98a73`) leży dziś tylko na `feat/spec-b-economy`. Etap 1 go potrzebuje (limiter), więc przenosimy ten jeden commit.

**Files:** brak nowych — cherry-pick.

- [ ] **Step 1: Utwórz gałąź od dokumentacji**

```bash
git switch docs/architecture-split
git switch -c feat/stage-1-monorepo-auth
git cherry-pick ef98a73
```
Expected: cherry-pick bez konfliktów (commit dotyka `src/`, `test/`, `package*.json`, `.env.example`).

- [ ] **Step 2: Zainstaluj i sprawdź testy**

```bash
npm install
npm test
npm run test:e2e
```
Expected: PASS w obu. Jeśli `world-parity.spec.ts` pada z braku pliku, sklonuj `../islanders` — to warunek wstępny, nie błąd planu.

---

### Task 1: Root workspace i przeniesienie kodu do `apps/core`

**Files:**
- Move: `src/`, `test/`, `drizzle/`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`, `vitest.config.e2e.ts`, `drizzle.config.ts`, `.env.example`, `package.json` → `apps/core/`
- Create: `package.json` (root), `tsconfig.base.json`
- Modify: `apps/core/package.json`, `apps/core/tsconfig.json`, `apps/core/src/infra/config/env.ts`, `apps/core/src/domain/geography/world-parity.spec.ts`, `apps/core/src/infra/config/env.spec.ts`, `.gitignore`
- Delete: `tsconfig.build.tsbuildinfo`, `dist/` (nieśledzone)

**Interfaces:**
- Produces: root skrypty `build`, `test`, `test:e2e`, `lint`, `format`, `compose:up`, `compose:down`; workspace `apps/core` o nazwie `@islanders/core`.

- [ ] **Step 1: Przenieś pliki z zachowaniem historii**

```bash
mkdir -p apps/core
git mv src test drizzle nest-cli.json tsconfig.json tsconfig.build.json \
  vitest.config.ts vitest.config.e2e.ts drizzle.config.ts .env.example package.json apps/core/
[ -f .env ] && mv .env apps/core/.env
rm -rf dist tsconfig.build.tsbuildinfo node_modules
git rm --cached package-lock.json && rm package-lock.json
```

- [ ] **Step 2: Utwórz `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2023",
    "sourceMap": true,
    "skipLibCheck": true,
    "strict": true,
    "strictPropertyInitialization": false,
    "types": ["vitest/globals", "node"]
  }
}
```

- [ ] **Step 3: Zastąp `apps/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "incremental": true
  }
}
```

- [ ] **Step 4: Utwórz root `package.json`**

```json
{
  "name": "islanders-backend",
  "private": true,
  "type": "module",
  "workspaces": ["apps/core"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "test:e2e": "npm run test:e2e --workspaces --if-present",
    "lint": "oxlint apps/ packages/",
    "format": "prettier --write \"{apps,packages}/*/{src,test}/**/*.ts\"",
    "compose:up": "docker compose up -d --wait",
    "compose:down": "docker compose down"
  },
  "devDependencies": {
    "oxlint": "^1.58.0",
    "prettier": "^3.4.2",
    "typescript": "^6.0.2"
  }
}
```

- [ ] **Step 5: Zmień `apps/core/package.json`**

Ustaw `"name": "@islanders/core"`. Usuń z `scripts`: `format`, `lint`, `compose:up`, `compose:down` (są w korzeniu). Usuń z `devDependencies`: `oxlint`, `prettier`. Pozostałe skrypty i zależności bez zmian.

- [ ] **Step 6: Popraw domyślny katalog klienta**

Skrypty workspace uruchamiają się z `apps/core`, więc `../islanders` wskazywałby `apps/islanders`.

W `apps/core/src/infra/config/env.ts`:
```ts
    ISLANDERS_CLIENT_DIR: z.string().default('../../../islanders'),
```
W `apps/core/src/domain/geography/world-parity.spec.ts` (linia z `process.env.ISLANDERS_CLIENT_DIR ??`):
```ts
const clientDir = process.env.ISLANDERS_CLIENT_DIR ?? '../../../islanders';
```
W `apps/core/src/infra/config/env.spec.ts`:
```ts
    expect(env.ISLANDERS_CLIENT_DIR).toBe('../../../islanders');
```
W `apps/core/.env.example` linia `ISLANDERS_CLIENT_DIR=../../../islanders`. Jeśli lokalny `apps/core/.env` ma `ISLANDERS_CLIENT_DIR=../islanders`, zmień go tak samo.

- [ ] **Step 7: Zaktualizuj `.gitignore`**

Zamień wpisy `/dist`, `/node_modules`, `/coverage` na wersje bez ukośnika na początku:
```
dist
node_modules
coverage
```

- [ ] **Step 8: Instalacja i testy**

```bash
npm install
npm test
npm run test:e2e
npm run lint
```
Expected: PASS; `package-lock.json` powstaje w korzeniu.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Turn the repository into an npm workspace with the game API under apps/core"
```
(ze stopką z Global Constraints)

---

### Task 2: `packages/domain`

**Files:**
- Create: `packages/domain/package.json`, `packages/domain/tsconfig.json`, `packages/domain/tsconfig.build.json`, `packages/domain/vitest.config.ts`
- Move: `apps/core/src/domain/{rules,balance,economy,time}` → `packages/domain/src/`
- Create: `apps/core/src/domain/geography/rules-agreement.spec.ts`
- Modify: `packages/domain/src/rules/rules.spec.ts`, root `package.json`, `apps/core/package.json`, każdy plik w `apps/core` importujący `domain/{rules,balance,economy,time}`

**Interfaces:**
- Produces: `@islanders/domain/rules`, `@islanders/domain/balance`, `@islanders/domain/economy`, `@islanders/domain/time` (w tym `Clock`, `systemClock`, `FixedClock`) — te same eksporty co dzisiejsze `index.ts`.

- [ ] **Step 1: Przenieś katalogi**

```bash
mkdir -p packages/domain/src
git mv apps/core/src/domain/rules apps/core/src/domain/balance \
  apps/core/src/domain/economy apps/core/src/domain/time packages/domain/src/
```

- [ ] **Step 2: `packages/domain/package.json`**

```json
{
  "name": "@islanders/domain",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./rules": { "types": "./dist/rules/index.d.ts", "default": "./dist/rules/index.js" },
    "./balance": { "types": "./dist/balance/index.d.ts", "default": "./dist/balance/index.js" },
    "./economy": { "types": "./dist/economy/index.d.ts", "default": "./dist/economy/index.js" },
    "./time": { "types": "./dist/time/index.d.ts", "default": "./dist/time/index.js" }
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 3: tsconfig i vitest pakietu**

`packages/domain/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src"]
}
```
`packages/domain/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "./src" },
  "exclude": ["node_modules", "dist", "**/*.spec.ts"]
}
```
`packages/domain/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, include: ['src/**/*.spec.ts'] },
});
```

- [ ] **Step 4: Rozdziel test reguł zależny od geografii**

W `packages/domain/src/rules/rules.spec.ts` usuń dwie pierwsze linie importu (`RESOURCE_ORDER`, `BIOME_RESOURCES`), test `'RESOURCES ma kolejność kontraktu geografii'` i test `'geografia i reguły opisują ten sam podział zasobów między biomy'`.

Utwórz `apps/core/src/domain/geography/rules-agreement.spec.ts`:
```ts
import { BIOMES, RESOURCES, biomeResources } from '@islanders/domain/rules';
import { RESOURCE_ORDER } from './constants.js';
import { BIOME_RESOURCES } from './island.js';

/** Geografia zostaje w core do etapu 3, więc zgodność z regułami pilnuje test po stronie core. */
describe('geografia a reguły domenowe', () => {
  it('RESOURCES ma kolejność kontraktu geografii', () => {
    expect([...RESOURCES]).toEqual([...RESOURCE_ORDER]);
  });

  it('geografia i reguły opisują ten sam podział zasobów między biomy', () => {
    for (const b of BIOMES) {
      expect([...biomeResources(b)].sort()).toEqual(
        [...BIOME_RESOURCES[b]].sort(),
      );
    }
  });
});
```

- [ ] **Step 5: Uruchom test pakietu**

Run: `npm install && npm run test -w packages/domain`
Expected: PASS (testy rules bez dwóch przeniesionych, balance, economy).

- [ ] **Step 6: Przepnij importy w core**

```bash
cd apps/core
grep -rlE "domain/(rules|balance|economy|time)/index\.js" src test \
  | xargs sed -i '' -E "s#'(\.\./)+(src/)?domain/(rules|balance|economy|time)/index\.js'#'@islanders/domain/\3'#g"
cd ../..
grep -rnE "domain/(rules|balance|economy|time)" apps/core/src apps/core/test
```
Expected: drugi `grep` nic nie wypisuje.

- [ ] **Step 7: Zależność i kolejność builda**

W `apps/core/package.json` w `dependencies`: `"@islanders/domain": "0.0.1"`.

W root `package.json`:
```json
  "workspaces": ["packages/domain", "apps/core"],
```
i skrypty:
```json
    "build:packages": "npm run build -w packages/domain",
    "build": "npm run build --workspaces --if-present",
    "test": "npm run build:packages && npm run test --workspaces --if-present",
    "test:e2e": "npm run build:packages && npm run test:e2e --workspaces --if-present",
```
W `apps/core/package.json` dopisz `"prebuild": "npm run build:packages --prefix ../.."`.

- [ ] **Step 8: Testy całości**

```bash
npm install
npm test
npm run test:e2e
npm run build
```
Expected: PASS; `apps/core/dist/main.js` istnieje.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Extract the pure game domain into @islanders/domain"
```

---

### Task 3: `packages/platform` bez zmiany zachowania

Przenosimy `apps/core/src/infra/*` do pakietu. W core zostają pliki o tych samych ścieżkach, ale jako re-eksporty albo cienkie konfiguracje, więc moduły i testy core nie zmieniają importów.

**Files:**
- Create: `packages/platform/{package.json,tsconfig.json,tsconfig.build.json,vitest.config.ts}`
- Move (`git mv`) do `packages/platform/src/`:
  - `apps/core/src/infra/db/pg-errors.ts` → `db/pg-errors.ts`
  - `apps/core/src/infra/db/schema/citext.ts` → `db/citext.ts`
  - `apps/core/src/infra/http/all-exceptions.filter.ts` (+ `.spec.ts`) → `http/`
  - `apps/core/src/infra/http/server-time.middleware.ts`, `server-time.interceptor.ts` (+ `.spec.ts`) → `http/`
  - `apps/core/src/infra/http/rate-limit.guard.ts` (+ `.spec.ts`) → `rate-limit/`
  - `apps/core/src/infra/redis/redis.module.ts` → `redis/`
  - `apps/core/src/infra/time/time.module.ts` → `time/`
  - `apps/core/src/infra/swagger/setup-swagger.ts` → `swagger/`
- Create: `packages/platform/src/config/{env,config.module}.ts`, `db/{db.module,migrate}.ts`, `http/configure-app.ts`, `index.ts`
- Recreate as shims in core: `apps/core/src/infra/{config/config.module.ts,config/env.ts,db/db.module.ts,db/migrate.ts,db/pg-errors.ts,db/schema/citext.ts,http/all-exceptions.filter.ts,http/configure-app.ts,http/rate-limit.guard.ts,http/server-time.interceptor.ts,http/server-time.middleware.ts,redis/redis.module.ts,time/time.module.ts}`

**Interfaces:**
- Produces (z `@islanders/platform`):
  - `ENV: symbol`, `AppConfigModule.forRoot(env: object): DynamicModule`
  - `durationToSeconds(text: string): number`, `durationSchema`, `baseEnvShape` (kształt obiektu zod), `withSwaggerDefault<T>(e: T & { NODE_ENV; SWAGGER_ENABLED?: 'true'|'false' })`, `EnvValidationError`, `parseEnvWith<S extends z.ZodType>(schema: S, raw): z.output<S>`
  - `DB`, `PG_CLIENT`, `DbModule.forRoot(schema: Record<string, unknown>): DynamicModule`, `runMigrations(url: string, migrationsFolder: string): Promise<void>`
  - `pgErrorCode`, `isUniqueViolation`, `isForeignKeyViolation`, `describeError(exception: unknown): string`
  - `AllExceptionsFilter`, `serverTimeMiddleware(clock)`, `ServerTimeInterceptor`
  - `RateLimitGuard`, `RateLimit`, `RATE_LIMIT`, `type RateLimitKey`
  - `REDIS`, `type RedisClient`, `RedisModule`
  - `CLOCK`, `TimeModule`
  - `setupSwagger(app, options: SwaggerOptions)`, `configureApp(app, options: ConfigureAppOptions)`
- Produces (z `@islanders/platform/citext`): `citext`

- [ ] **Step 1: Szkielet pakietu**

`packages/platform/package.json`:
```json
{
  "name": "@islanders/platform",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./citext": { "types": "./dist/db/citext.d.ts", "default": "./dist/db/citext.js" }
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "test": "vitest run"
  },
  "dependencies": {
    "@islanders/domain": "0.0.1",
    "@nestjs/common": "^12.0.1",
    "@nestjs/core": "^12.0.1",
    "@nestjs/swagger": "^12.0.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "drizzle-orm": "^0.45.2",
    "ioredis": "^6.0.0",
    "postgres": "^3.4.9",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```
`packages/platform/tsconfig.json` i `tsconfig.build.json` — identyczne jak w `packages/domain` (Task 2, Step 3).
`packages/platform/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
```

- [ ] **Step 2: Przenieś pliki**

```bash
P=packages/platform/src; C=apps/core/src/infra
mkdir -p $P/{config,db,http,rate-limit,redis,time,swagger}
git mv $C/db/pg-errors.ts $P/db/pg-errors.ts
git mv $C/db/schema/citext.ts $P/db/citext.ts
git mv $C/http/all-exceptions.filter.ts $C/http/all-exceptions.filter.spec.ts $P/http/
git mv $C/http/server-time.middleware.ts $C/http/server-time.interceptor.ts $C/http/server-time.interceptor.spec.ts $P/http/
git mv $C/http/rate-limit.guard.ts $C/http/rate-limit.guard.spec.ts $P/rate-limit/
git mv $C/redis/redis.module.ts $P/redis/redis.module.ts
git mv $C/time/time.module.ts $P/time/time.module.ts
git mv $C/swagger/setup-swagger.ts $P/swagger/setup-swagger.ts
```

- [ ] **Step 3: `config/env.ts` i `config/config.module.ts` w platform**

`packages/platform/src/config/env.ts`:
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

export const durationSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'użyj formatu 15m, 12h albo 30d');

/** Zmienne wspólne dla wszystkich aplikacji; aplikacja rozszerza kształt własnymi polami. */
export const baseEnvShape = {
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'musi zaczynać się od postgres://'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_PLAYER_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
};

/** Swagger domyślnie włączony poza produkcją; jawna wartość zawsze wygrywa. */
export function withSwaggerDefault<
  T extends { NODE_ENV: string; SWAGGER_ENABLED?: 'true' | 'false' },
>(e: T): Omit<T, 'SWAGGER_ENABLED'> & { SWAGGER_ENABLED: boolean } {
  return {
    ...e,
    SWAGGER_ENABLED:
      e.SWAGGER_ENABLED === undefined
        ? e.NODE_ENV !== 'production'
        : e.SWAGGER_ENABLED === 'true',
  };
}

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(
      `Niepoprawna konfiguracja środowiska:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/** Waliduje surowe zmienne środowiskowe. Rzuca EnvValidationError zamiast startować z dziurą w konfiguracji. */
export function parseEnvWith<S extends z.ZodType>(
  schema: S,
  raw: Record<string, string | undefined>,
): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  return result.data;
}
```
`packages/platform/src/config/config.module.ts`:
```ts
import { DynamicModule, Global, Module } from '@nestjs/common';

/** Token do wstrzykiwania zwalidowanej konfiguracji: `@Inject(ENV) private readonly env: Env`. */
export const ENV = Symbol('ENV');

@Global()
@Module({})
export class AppConfigModule {
  static forRoot(env: object): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
    };
  }
}
```

- [ ] **Step 4: `db/db.module.ts`, `db/migrate.ts` w platform, `describeError`**

`packages/platform/src/db/db.module.ts`:
```ts
import {
  DynamicModule,
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { ENV } from '../config/config.module.js';

export const DB = Symbol('DB');
export const PG_CLIENT = Symbol('PG_CLIENT');

@Injectable()
class DbShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_CLIENT) private readonly client: Sql) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

@Global()
@Module({})
export class DbModule {
  /** Schemat podaje aplikacja; typ `Db` definiuje aplikacja jako `PostgresJsDatabase<typeof schema>`. */
  static forRoot(schema: Record<string, unknown>): DynamicModule {
    return {
      module: DbModule,
      providers: [
        {
          provide: PG_CLIENT,
          inject: [ENV],
          useFactory: (env: { DATABASE_URL: string }): Sql =>
            postgres(env.DATABASE_URL, { max: 10 }),
        },
        {
          provide: DB,
          inject: [PG_CLIENT],
          useFactory: (client: Sql) => drizzle(client, { schema }),
        },
        DbShutdown,
      ],
      exports: [DB, PG_CLIENT],
    };
  }
}
```
`packages/platform/src/db/migrate.ts`:
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/** Uruchamia migracje z podanego katalogu na wskazanej bazie i zamyka połączenie. */
export async function runMigrations(url: string, migrationsFolder: string): Promise<void> {
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
```
W `packages/platform/src/http/all-exceptions.filter.ts`: wytnij funkcję `detailsFor` razem z jej komentarzem i przenieś na koniec `packages/platform/src/db/pg-errors.ts` jako `export function describeError(exception: unknown): string` (treść bez zmian, `pgErrorCode` jest już w tym pliku). W filtrze zamień import na `import { describeError } from '../db/pg-errors.js';` i wywołanie `detailsFor(exception)` na `describeError(exception)`.

- [ ] **Step 5: Popraw importy w przeniesionych plikach**

```bash
cd packages/platform/src
sed -i '' "s#'../../domain/time/index.js'#'@islanders/domain/time'#" \
  http/server-time.middleware.ts http/server-time.interceptor.ts http/server-time.interceptor.spec.ts \
  rate-limit/rate-limit.guard.ts rate-limit/rate-limit.guard.spec.ts
sed -i '' "s#'../../domain/time/index.js'#'@islanders/domain/time'#" time/time.module.ts
cd ../../..
```
Następnie ręcznie:
- `rate-limit/rate-limit.guard.ts`: zamień `import type { Env } from '../config/env.js';` na lokalny typ
  ```ts
  type RateLimitEnv = { RATE_LIMIT_AUTH_PER_MINUTE: number; RATE_LIMIT_PLAYER_PER_MINUTE: number };
  ```
  i `@Inject(ENV) private readonly env: Env` na `@Inject(ENV) private readonly env: RateLimitEnv`.
- `rate-limit/rate-limit.guard.spec.ts`: `import type { Env } from '../config/env.js';` usuń, a `as Env` zamień na `as never`.
- `redis/redis.module.ts`: `import type { Env } from '../config/env.js';` usuń; `useFactory: (env: Env)` → `useFactory: (env: { REDIS_URL: string })`.
- `swagger/setup-swagger.ts` zastąp całym:
  ```ts
  import { INestApplication } from '@nestjs/common';
  import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

  export interface SwaggerOptions {
    title: string;
    description: string;
    tags: string[];
    /** Ścieżka UI, np. `api/docs`; JSON leży pod `<path>-json`. */
    path: string;
  }

  /** Dokumentuje kontrakt, nie definiuje go: kształt JSON-a sprawdzają testy e2e. */
  export function setupSwagger(app: INestApplication, options: SwaggerOptions): void {
    let builder = new DocumentBuilder()
      .setTitle(options.title)
      .setDescription(options.description)
      .setVersion('1')
      .addBearerAuth();
    for (const tag of options.tags) builder = builder.addTag(tag);
    const document = SwaggerModule.createDocument(app, builder.build());
    SwaggerModule.setup(options.path, app, document, {
      jsonDocumentUrl: `${options.path}-json`,
    });
  }
  ```

- [ ] **Step 6: `http/configure-app.ts` i `index.ts` w platform**

`packages/platform/src/http/configure-app.ts`:
```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import { setupSwagger, type SwaggerOptions } from '../swagger/setup-swagger.js';
import { CLOCK } from '../time/time.module.js';
import { serverTimeMiddleware } from './server-time.middleware.js';

export interface ConfigureAppOptions {
  env: { SWAGGER_ENABLED: boolean };
  /** Brak = bez globalnego prefiksu (kontrolery deklarują pełne ścieżki). */
  globalPrefix?: string;
  swagger: SwaggerOptions;
}

/**
 * Jedno miejsce konfiguracji aplikacji HTTP, wspólne dla main.ts i testów e2e,
 * żeby testy biły w dokładnie tę samą aplikację, która idzie na produkcję.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  app.use(serverTimeMiddleware(app.get<Clock>(CLOCK)));
  if (options.globalPrefix) {
    app.setGlobalPrefix(options.globalPrefix);
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
  if (options.env.SWAGGER_ENABLED) {
    setupSwagger(app, options.swagger);
  }
}
```
`packages/platform/src/index.ts`:
```ts
export * from './config/config.module.js';
export * from './config/env.js';
export * from './db/db.module.js';
export * from './db/migrate.js';
export * from './db/pg-errors.js';
export * from './http/all-exceptions.filter.js';
export * from './http/configure-app.js';
export * from './http/server-time.interceptor.js';
export * from './http/server-time.middleware.js';
export * from './rate-limit/rate-limit.guard.js';
export * from './redis/redis.module.js';
export * from './swagger/setup-swagger.js';
export * from './time/time.module.js';
```

- [ ] **Step 7: Testy pakietu**

```bash
npm install
npm run build -w packages/domain
npm run test -w packages/platform
npm run build -w packages/platform
```
Expected: PASS (all-exceptions.filter, server-time.interceptor, rate-limit.guard); build bez błędów.

- [ ] **Step 8: Re-eksporty w core**

`apps/core/src/infra/config/config.module.ts`:
```ts
export { ENV, AppConfigModule } from '@islanders/platform';
```
`apps/core/src/infra/config/env.ts` — zastąp całym:
```ts
import { z } from 'zod';
import {
  baseEnvShape,
  durationSchema,
  durationToSeconds,
  parseEnvWith,
  withSwaggerDefault,
} from '@islanders/platform';

export { EnvValidationError, durationToSeconds } from '@islanders/platform';

export const envSchema = z
  .object({
    ...baseEnvShape,
    JWT_SECRET: z.string().min(32, 'co najmniej 32 znaki'),
    JWT_ACCESS_TTL: durationSchema.default('15m').transform(durationToSeconds),
    JWT_REFRESH_TTL: durationSchema.default('30d').transform(durationToSeconds),
    ISLANDERS_CLIENT_DIR: z.string().default('../../../islanders'),
    SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .transform(withSwaggerDefault);

export type Env = z.output<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return parseEnvWith(envSchema, raw);
}
```
`apps/core/src/infra/db/db.module.ts`:
```ts
import { DbModule as PlatformDbModule } from '@islanders/platform';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export { DB, PG_CLIENT } from '@islanders/platform';

export type Db = PostgresJsDatabase<typeof schema>;
/** Baza albo transakcja — repozytoria przyjmują oba, żeby dało się je składać w jedną transakcję. */
export type DbClient = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export const DbModule = PlatformDbModule.forRoot(schema);
```
`apps/core/src/infra/db/migrate.ts`:
```ts
import path from 'node:path';
import { runMigrations as run } from '@islanders/platform';

/** Migracje core leżą w `apps/core/drizzle`; skrypty i testy uruchamiają się z `apps/core`. */
export function runMigrations(
  url: string,
  migrationsFolder: string = path.resolve(process.cwd(), 'drizzle'),
): Promise<void> {
  return run(url, migrationsFolder);
}
```
`apps/core/src/infra/db/pg-errors.ts`:
```ts
export { pgErrorCode, isUniqueViolation, isForeignKeyViolation } from '@islanders/platform';
```
`apps/core/src/infra/db/schema/citext.ts`:
```ts
export { citext } from '@islanders/platform/citext';
```
`apps/core/src/infra/http/all-exceptions.filter.ts`:
```ts
export { AllExceptionsFilter } from '@islanders/platform';
```
`apps/core/src/infra/http/rate-limit.guard.ts`:
```ts
export { RATE_LIMIT, RateLimit, RateLimitGuard, type RateLimitKey } from '@islanders/platform';
```
`apps/core/src/infra/http/server-time.interceptor.ts`:
```ts
export { ServerTimeInterceptor } from '@islanders/platform';
```
`apps/core/src/infra/http/server-time.middleware.ts`:
```ts
export { serverTimeMiddleware } from '@islanders/platform';
```
`apps/core/src/infra/redis/redis.module.ts`:
```ts
export { REDIS, RedisModule, type RedisClient } from '@islanders/platform';
```
`apps/core/src/infra/time/time.module.ts`:
```ts
export { CLOCK, TimeModule } from '@islanders/platform';
```
`apps/core/src/infra/http/configure-app.ts`:
```ts
import { INestApplication } from '@nestjs/common';
import { configureApp as configurePlatformApp } from '@islanders/platform';
import type { Env } from '../config/env.js';

export function configureApp(app: INestApplication, env: Env): void {
  configurePlatformApp(app, {
    env,
    globalPrefix: 'api/v1',
    swagger: {
      title: 'Islanders API',
      description:
        'Backend gry Islanders. Wszystkie trasy poza /auth/* i /health wymagają Bearer JWT.',
      tags: ['health', 'auth', 'worlds', 'settlements', 'fleets'],
      path: 'api/docs',
    },
  });
}
```
Usuń pusty katalog `apps/core/src/infra/swagger`.

W `apps/core/package.json` dopisz zależność `"@islanders/platform": "0.0.1"`. W root `package.json`:
```json
  "workspaces": ["packages/domain", "packages/platform", "apps/core"],
```
```json
    "build:packages": "npm run build -w packages/domain -w packages/platform",
```

- [ ] **Step 9: Testy całości**

```bash
npm install
npm test
npm run test:e2e
npm run build
npm run lint
```
Expected: PASS. Jeśli `drizzle-kit` jest używany: `npm run db:generate -w apps/core` wypisuje „No schema changes”.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Move shared Nest infrastructure into @islanders/platform and keep core imports as re-exports"
```

---

### Task 4: Limiter na Redisie, limit po adresie przed uwierzytelnieniem, `TRUST_PROXY`

**Files:**
- Create: `packages/platform/src/util/with-timeout.ts`, `packages/platform/src/rate-limit/window.ts` (+ `window.spec.ts`), `rate-limit/rate-limiter.ts`, `rate-limit/ip-rate-limit.middleware.ts`, `rate-limit/rate-limit.module.ts`, `packages/platform/src/config/trust-proxy.spec.ts`
- Modify: `packages/platform/src/rate-limit/rate-limit.guard.ts` (+ `.spec.ts`), `packages/platform/src/config/env.ts`, `packages/platform/src/http/configure-app.ts`, `packages/platform/src/index.ts`
- Modify: `apps/core/src/app.module.ts`, `apps/core/src/modules/auth/jwt-auth.guard.ts`, `apps/core/src/infra/http/http.module.ts`, `apps/core/src/infra/http/rate-limit.guard.ts`, `apps/core/test/support/test-app.ts`, `apps/core/test/http.e2e-spec.ts`, `apps/core/.env.example`, `apps/core/src/infra/config/env.spec.ts`

**Interfaces:**
- Consumes: `REDIS`, `CLOCK`, `ENV` (Task 3).
- Produces:
  - `withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>` (odrzuca `TimeoutError`)
  - `windowIndex(nowMs, windowMs): number`, `windowKey(prefix, bucket, subject, nowMs, windowMs): string`, `retryAfterSeconds(nowMs, windowMs): number`
  - `RateLimiter.hit(bucket: string, subject: string, limit: number, windowMs?: number): Promise<RateLimitDecision>`; `type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }`
  - `RateLimitModule` (globalny, dostarcza `RateLimiter`)
  - `ipRateLimitMiddleware(limiter: RateLimiter, limit: number)`
  - `RateLimitGuard` (asynchroniczny), `RateLimitKey = 'ip' | 'subject'`; strażnik czyta `req.rateLimitSubject?: string`
  - `parseTrustProxy(value: string): boolean | number | string`
  - Zmienne bazowe: `RATE_LIMIT_AUTH_PER_MINUTE` (10), `RATE_LIMIT_SUBJECT_PER_MINUTE` (120), `RATE_LIMIT_IP_PER_MINUTE` (600), `RATE_LIMIT_PREFIX` (`rl`), `TRUST_PROXY` (`false`)

- [ ] **Step 1: Test okna (failing)**

`packages/platform/src/rate-limit/window.spec.ts`:
```ts
import { retryAfterSeconds, windowIndex, windowKey } from './window.js';

describe('okno limitera', () => {
  const at = Date.parse('2026-09-08T12:00:30.000Z');

  it('indeks okna zmienia się dokładnie na granicy minuty', () => {
    const start = Date.parse('2026-09-08T12:00:00.000Z');
    expect(windowIndex(start, 60_000)).toBe(windowIndex(start + 59_999, 60_000));
    expect(windowIndex(start + 60_000, 60_000)).toBe(windowIndex(start, 60_000) + 1);
  });

  it('klucz zawiera prefiks, kubełek, podmiot i indeks okna', () => {
    expect(windowKey('rl', 'login', '1.2.3.4', at, 60_000)).toBe(
      `rl:login:1.2.3.4:${Math.floor(at / 60_000)}`,
    );
  });

  it('Retry-After to sekundy do końca okna, zaokrąglone w górę, co najmniej 1', () => {
    expect(retryAfterSeconds(at, 60_000)).toBe(30);
    expect(retryAfterSeconds(at + 29_500, 60_000)).toBe(1);
    expect(retryAfterSeconds(Date.parse('2026-09-08T12:00:59.999Z'), 60_000)).toBe(1);
  });
});
```
Run: `npm run test -w packages/platform -- window`
Expected: FAIL (brak modułu `./window.js`).

- [ ] **Step 2: Implementacja okna i timeoutu**

`packages/platform/src/rate-limit/window.ts`:
```ts
export function windowIndex(nowMs: number, windowMs: number): number {
  return Math.floor(nowMs / windowMs);
}

/** Indeks okna w kluczu sprawia, że nowe okno to nowy klucz — bez polegania na TTL. */
export function windowKey(
  prefix: string,
  bucket: string,
  subject: string,
  nowMs: number,
  windowMs: number,
): string {
  return `${prefix}:${bucket}:${subject}:${windowIndex(nowMs, windowMs)}`;
}

export function retryAfterSeconds(nowMs: number, windowMs: number): number {
  const end = (windowIndex(nowMs, windowMs) + 1) * windowMs;
  return Math.max(1, Math.ceil((end - nowMs) / 1000));
}
```
`packages/platform/src/util/with-timeout.ts`:
```ts
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`przekroczono limit czasu ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Klient Redisa ma `maxRetriesPerRequest: null` (wymóg BullMQ), więc przy zerwanym połączeniu
 * polecenie czeka w nieskończoność zamiast się wywrócić. Każde wywołanie, które ma prawo
 * zawieść szybko, owijamy tym limitem.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
```
Run: `npm run test -w packages/platform -- window`
Expected: PASS.

- [ ] **Step 3: `TRUST_PROXY` — test (failing)**

`packages/platform/src/config/trust-proxy.spec.ts`:
```ts
import { parseTrustProxy } from './env.js';

describe('parseTrustProxy', () => {
  it('false i true jako wartości logiczne', () => {
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
  });
  it('liczba przeskoków jako liczba', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });
  it('lista podsieci jako tekst przekazywany Expressowi', () => {
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12')).toBe('10.0.0.0/8,172.16.0.0/12');
  });
});
```
Run: `npm run test -w packages/platform -- trust-proxy`
Expected: FAIL.

- [ ] **Step 4: Zmienne bazowe**

W `packages/platform/src/config/env.ts` dodaj funkcję i zamień pola limitów oraz `TRUST_PROXY` w `baseEnvShape`:
```ts
/** Wartość dla `app.set('trust proxy', …)`: false, true, liczba przeskoków albo lista podsieci. */
export function parseTrustProxy(value: string): boolean | number | string {
  if (value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
}
```
```ts
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_SUBJECT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  RATE_LIMIT_IP_PER_MINUTE: z.coerce.number().int().min(1).default(600),
  RATE_LIMIT_PREFIX: z.string().min(1).default('rl'),
  TRUST_PROXY: z.string().default('false').transform(parseTrustProxy),
```
Run: `npm run test -w packages/platform -- trust-proxy`
Expected: PASS.

- [ ] **Step 5: `RateLimiter` i moduł**

`packages/platform/src/rate-limit/rate-limiter.ts`:
```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import { ENV } from '../config/config.module.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { CLOCK } from '../time/time.module.js';
import { withTimeout } from '../util/with-timeout.js';
import { retryAfterSeconds, windowKey } from './window.js';

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

const REDIS_TIMEOUT_MS = 200;

/**
 * Stałe okno w Redisie, wspólne dla wszystkich replik. Przy niedostępnym Redisie przepuszcza
 * ruch: utrata limitu jest mniejszym złem niż zatrzymanie logowania dla wszystkich.
 */
@Injectable()
export class RateLimiter {
  private readonly logger = new Logger(RateLimiter.name);

  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: { RATE_LIMIT_PREFIX: string },
  ) {}

  async hit(
    bucket: string,
    subject: string,
    limit: number,
    windowMs = 60_000,
  ): Promise<RateLimitDecision> {
    const now = this.clock.now().getTime();
    const key = windowKey(this.env.RATE_LIMIT_PREFIX, bucket, subject, now, windowMs);
    let count: number;
    try {
      const results = await withTimeout(
        this.redis.multi().incr(key).pexpire(key, windowMs * 2).exec(),
        REDIS_TIMEOUT_MS,
      );
      count = Number(results?.[0]?.[1]);
    } catch (err) {
      this.logger.warn(
        `Limiter pominięty, Redis niedostępny: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { allowed: true };
    }
    return count > limit
      ? { allowed: false, retryAfterSeconds: retryAfterSeconds(now, windowMs) }
      : { allowed: true };
  }
}
```
`packages/platform/src/rate-limit/rate-limit.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter.js';

/** Wymaga w aplikacji RedisModule, TimeModule i AppConfigModule. */
@Global()
@Module({ providers: [RateLimiter], exports: [RateLimiter] })
export class RateLimitModule {}
```

- [ ] **Step 6: Test strażnika (failing) — przepisz `rate-limit.guard.spec.ts`**

`packages/platform/src/rate-limit/rate-limit.guard.spec.ts` — zastąp całym:
```ts
import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT, RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimitDecision, RateLimiter } from './rate-limiter.js';

const env = { RATE_LIMIT_AUTH_PER_MINUTE: 10, RATE_LIMIT_SUBJECT_PER_MINUTE: 120 };

/** Licznik w pamięci o semantyce RateLimiter.hit — strażnik testujemy bez Redisa. */
class FakeLimiter {
  readonly counts = new Map<string, number>();
  readonly calls: Array<{ bucket: string; subject: string; limit: number }> = [];
  async hit(bucket: string, subject: string, limit: number): Promise<RateLimitDecision> {
    this.calls.push({ bucket, subject, limit });
    const key = `${bucket}:${subject}`;
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n > limit ? { allowed: false, retryAfterSeconds: 42 } : { allowed: true };
  }
}

function context(req: Record<string, unknown>, handler: object, cls: object = class C {}) {
  const headers: Record<string, string> = {};
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
    }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
  return { ctx, headers };
}

describe('RateLimitGuard', () => {
  const make = () => {
    const limiter = new FakeLimiter();
    const guard = new RateLimitGuard(new Reflector(), limiter as unknown as RateLimiter, env);
    return { limiter, guard };
  };

  it('trasa bez metadanych i bez podmiotu: bez limitu, bez wywołania limitera', async () => {
    const { guard, limiter } = make();
    const { ctx } = context({ ip: '1.1.1.1' }, function open() {});
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(limiter.calls).toHaveLength(0);
  });

  it('trasa z podmiotem: kubełek po podmiocie z limitem RATE_LIMIT_SUBJECT_PER_MINUTE', async () => {
    const { guard, limiter } = make();
    const handler = function state() {};
    for (let i = 0; i < 120; i++) {
      expect(await guard.canActivate(context({ rateLimitSubject: 'a', ip: '1.1.1.1' }, handler).ctx)).toBe(true);
    }
    const { ctx, headers } = context({ rateLimitSubject: 'a', ip: '1.1.1.1' }, handler);
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(HttpException);
    expect(headers['Retry-After']).toBe('42');
    expect(await guard.canActivate(context({ rateLimitSubject: 'b', ip: '1.1.1.1' }, handler).ctx)).toBe(true);
    expect(limiter.calls[0]).toEqual({ bucket: 'subject', subject: 'a', limit: 120 });
  });

  it('@RateLimit("ip"): kubełek po trasie i adresie z limitem RATE_LIMIT_AUTH_PER_MINUTE', async () => {
    const { guard, limiter } = make();
    const login = function login() {};
    Reflect.defineMetadata(RATE_LIMIT, 'ip', login);
    for (let i = 0; i < 10; i++) {
      await guard.canActivate(context({ ip: '2.2.2.2' }, login).ctx);
    }
    let status = 0;
    try {
      await guard.canActivate(context({ ip: '2.2.2.2' }, login).ctx);
    } catch (e) {
      status = (e as HttpException).getStatus();
    }
    expect(status).toBe(429);
    expect(limiter.calls[0]).toEqual({ bucket: 'ip:C.login', subject: '2.2.2.2', limit: 10 });
  });
});
```
Run: `npm run test -w packages/platform -- rate-limit.guard`
Expected: FAIL (konstruktor strażnika ma inną sygnaturę).

- [ ] **Step 7: Strażnik na `RateLimiter`**

`packages/platform/src/rate-limit/rate-limit.guard.ts` — zastąp całym:
```ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENV } from '../config/config.module.js';
import { RateLimiter } from './rate-limiter.js';

export type RateLimitKey = 'ip' | 'subject';

export const RATE_LIMIT = 'rateLimit';
/** Jawny klucz limitu dla trasy, np. `@RateLimit('ip')` na logowaniu; wartość limitu z env. */
export const RateLimit = (key: RateLimitKey) => SetMetadata(RATE_LIMIT, key);

type RateLimitEnv = {
  RATE_LIMIT_AUTH_PER_MINUTE: number;
  RATE_LIMIT_SUBJECT_PER_MINUTE: number;
};

export function tooManyRequests(): HttpException {
  return new HttpException(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Za dużo żądań, spróbuj za chwilę',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Limit na trasie: po adresie i trasie (`@RateLimit('ip')`) albo po podmiocie ustawionym przez
 * strażnika uwierzytelniania w `req.rateLimitSubject`. Musi działać PO tym strażniku.
 * `req.ip` jest wiarygodne tylko przy poprawnie ustawionym `TRUST_PROXY`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: RateLimitEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ rateLimitSubject?: string; ip?: string }>();
    const explicit = this.reflector.getAllAndOverride<RateLimitKey | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const keyBy: RateLimitKey | null =
      explicit ?? (req.rateLimitSubject !== undefined ? 'subject' : null);
    if (!keyBy) return true;

    const bySubject = keyBy === 'subject' && req.rateLimitSubject !== undefined;
    const decision = bySubject
      ? await this.limiter.hit('subject', req.rateLimitSubject!, this.env.RATE_LIMIT_SUBJECT_PER_MINUTE)
      : await this.limiter.hit(
          `ip:${context.getClass().name}.${context.getHandler().name}`,
          req.ip ?? 'unknown',
          this.env.RATE_LIMIT_AUTH_PER_MINUTE,
        );
    if (!decision.allowed) {
      http.getResponse<{ setHeader(k: string, v: string): void }>()
        .setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw tooManyRequests();
    }
    return true;
  }
}
```
Run: `npm run test -w packages/platform -- rate-limit.guard`
Expected: PASS.

- [ ] **Step 8: Middleware po adresie i `configureApp`**

`packages/platform/src/rate-limit/ip-rate-limit.middleware.ts`:
```ts
import type { NextFunction, Request, Response } from 'express';
import type { RateLimiter } from './rate-limiter.js';

/**
 * Sufit po adresie na WSZYSTKICH trasach, liczony przed uwierzytelnieniem. Bez niego zalew
 * żądań ze złym tokenem odbijał się od strażnika JWT, zanim cokolwiek policzył limiter.
 */
export function ipRateLimitMiddleware(limiter: RateLimiter, limit: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const decision = await limiter.hit('ip-global', req.ip ?? 'unknown', limit);
    if (decision.allowed) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    res.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Za dużo żądań, spróbuj za chwilę',
    });
  };
}
```
W `packages/platform/src/http/configure-app.ts`:
- rozszerz typ: `env: { SWAGGER_ENABLED: boolean; TRUST_PROXY: boolean | number | string; RATE_LIMIT_IP_PER_MINUTE: number };`
- dodaj importy:
  ```ts
  import type { Express } from 'express';
  import { ipRateLimitMiddleware } from '../rate-limit/ip-rate-limit.middleware.js';
  import { RateLimiter } from '../rate-limit/rate-limiter.js';
  ```
- początek funkcji zastąp:
  ```ts
  if (options.env.TRUST_PROXY !== false) {
    app.getHttpAdapter().getInstance<Express>().set('trust proxy', options.env.TRUST_PROXY);
  }
  app.use(serverTimeMiddleware(app.get<Clock>(CLOCK)));
  app.use(ipRateLimitMiddleware(app.get(RateLimiter), options.env.RATE_LIMIT_IP_PER_MINUTE));
  ```
W `packages/platform/src/index.ts` dopisz:
```ts
export * from './rate-limit/ip-rate-limit.middleware.js';
export * from './rate-limit/rate-limit.module.js';
export * from './rate-limit/rate-limiter.js';
export * from './rate-limit/window.js';
export * from './util/with-timeout.js';
```
Run: `npm run build -w packages/platform && npm run test -w packages/platform`
Expected: PASS.

- [ ] **Step 9: Core — podmiot limitu, moduł, zmienne**

`apps/core/src/modules/auth/jwt-auth.guard.ts`:
- w `AuthenticatedRequest` dodaj `rateLimitSubject?: string;`
- po `req.playerId = playerId;` dodaj `req.rateLimitSubject = String(playerId);`

`apps/core/src/infra/http/rate-limit.guard.ts` — bez zmian (re-eksport). `apps/core/src/infra/http/http.module.ts` — zmień komentarz nad klasą na:
```ts
/** Importować PO AuthModule, żeby RateLimitGuard widział `req.rateLimitSubject` ustawione przez JwtAuthGuard. */
```
`apps/core/src/app.module.ts`: import `RateLimitModule` z `@islanders/platform` i wstaw go zaraz po `RedisModule`; w komentarzu nad `HttpModule` zamień `req.playerId` na `req.rateLimitSubject`.

`apps/core/.env.example`: zamień `RATE_LIMIT_PLAYER_PER_MINUTE=120` na
```
RATE_LIMIT_SUBJECT_PER_MINUTE=120
# Sufit żądań na minutę z jednego adresu, liczony przed uwierzytelnieniem
RATE_LIMIT_IP_PER_MINUTE=600
# Prefiks kluczy limitera w Redisie
RATE_LIMIT_PREFIX=rl
```
i opis `TRUST_PROXY` na `# false | true | liczba przeskoków | lista podsieci po przecinku`.

`apps/core/src/infra/config/env.spec.ts`: w teście domyślnych zamień `expect(env.RATE_LIMIT_PLAYER_PER_MINUTE).toBe(120);` na
```ts
    expect(env.RATE_LIMIT_SUBJECT_PER_MINUTE).toBe(120);
    expect(env.RATE_LIMIT_IP_PER_MINUTE).toBe(600);
    expect(env.TRUST_PROXY).toBe(false);
```

`apps/core/test/support/test-app.ts` w `parseEnv({...})` dodaj (przed `...options.env`):
```ts
    RATE_LIMIT_IP_PER_MINUTE: '100000',
    // Kontener Redisa jest wspólny dla całego przebiegu; osobny prefiks na aplikację,
    // żeby kubełki jednego pliku testów nie przeciekały do następnego.
    RATE_LIMIT_PREFIX: `rl-test-${randomUUID()}`,
```
z importem `import { randomUUID } from 'node:crypto';`.

- [ ] **Step 10: E2E core — nowe zachowania (failing)**

W `apps/core/test/http.e2e-spec.ts`:
- w `beforeAll` zamień `RATE_LIMIT_PLAYER_PER_MINUTE: '5'` na `RATE_LIMIT_SUBJECT_PER_MINUTE: '5'`;
- w teście „login ograniczony…” po `expect(limited.body.message)…` dodaj `expect(limited.headers['retry-after']).toBeDefined();`
- dopisz na końcu `describe`:
```ts
  it('zalew złymi tokenami zużywa sufit po adresie, zanim zadziała strażnik JWT', async () => {
    const floodApp = await createTestApp({ env: { RATE_LIMIT_IP_PER_MINUTE: '3' } });
    try {
      const flood = () =>
        request(floodApp.getHttpServer())
          .get('/api/v1/worlds')
          .set('Authorization', 'Bearer zly.token.jwt');
      for (let i = 0; i < 3; i++) await flood().expect(401);
      const limited = await flood().expect(429);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      await floodApp.close();
    }
  });

  it('dwie instancje na tym samym Redisie i prefiksie dzielą kubełek', async () => {
    const shared = { RATE_LIMIT_AUTH_PER_MINUTE: '2', RATE_LIMIT_PREFIX: `rl-shared-${Date.now()}` };
    const one = await createTestApp({ env: shared });
    const two = await createTestApp({ env: shared });
    try {
      const body = { email: 'nikt@test.local', password: 'zle-haslo' };
      await request(one.getHttpServer()).post('/api/v1/auth/login').send(body).expect(401);
      await request(two.getHttpServer()).post('/api/v1/auth/login').send(body).expect(401);
      await request(one.getHttpServer()).post('/api/v1/auth/login').send(body).expect(429);
    } finally {
      await one.close();
      await two.close();
    }
  });

  it('TRUST_PROXY=1: różne X-Forwarded-For to różne kubełki po adresie', async () => {
    const proxied = await createTestApp({
      env: { RATE_LIMIT_AUTH_PER_MINUTE: '1', TRUST_PROXY: '1' },
    });
    try {
      const login = (ip: string) =>
        request(proxied.getHttpServer())
          .post('/api/v1/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: 'nikt@test.local', password: 'zle-haslo' });
      await login('203.0.113.1').expect(401);
      await login('203.0.113.1').expect(429);
      await login('203.0.113.2').expect(401);
    } finally {
      await proxied.close();
    }
  });
```
Run: `npm run build:packages && npm run test:e2e -w apps/core -- http`
Expected przed Step 9 (jeśli wykonujesz ściśle TDD, przenieś Step 10 przed Step 9): FAIL; po Step 9: PASS.

- [ ] **Step 11: Testy całości i commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Back the rate limiter with Redis, limit by address before authentication and parse TRUST_PROXY"
```
Expected: PASS.

---

### Task 5: `packages/contracts`

**Files:**
- Create: `packages/contracts/{package.json,tsconfig.json,tsconfig.build.json,vitest.config.ts}`
- Create: `packages/contracts/src/{slug,claims,worlds,events,errors,index}.ts`, `packages/contracts/src/contracts.spec.ts`
- Modify: root `package.json`

**Interfaces:**
- Produces:
  - `worldSlugSchema`
  - `AUDIENCE = { worlds: 'islanders-worlds', tools: 'islanders-tools', internal: 'islanders-internal' }`, `ROLES`, `type Role`, `roleSchema`, `worldsAccessClaimsSchema`, `toolsClaimsSchema`, `serviceClaimsSchema`, `type WorldsAccessClaims`, `type ToolsClaims`, `type ServiceClaims`, `serviceSubject(slug): string`, `slugFromServiceSubject(sub): string`
  - `WORLD_STATUSES`, `worldStatusSchema`, `type WorldStatus`, `worldRegistrationSchema`, `type WorldRegistration`, `worldListItemSchema`, `type WorldListItem`
  - `worldEventSchema`, `type WorldEvent`, `eventBatchSchema`, `type EventBatch`, `MAX_EVENT_BATCH = 100`
  - `errorBodySchema`, `type ErrorBody`

- [ ] **Step 1: Szkielet pakietu**

`packages/contracts/package.json`:
```json
{
  "name": "@islanders/contracts",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json",
    "test": "vitest run"
  },
  "dependencies": { "zod": "^4.5.4" },
  "devDependencies": { "typescript": "^6.0.2", "vitest": "^4.1.2" }
}
```
`tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` — identyczne jak w `packages/domain` (Task 2, Step 3).

Root `package.json`:
```json
  "workspaces": ["packages/domain", "packages/contracts", "packages/platform", "apps/core"],
```
```json
    "build:packages": "npm run build -w packages/domain -w packages/contracts -w packages/platform",
```

- [ ] **Step 2: Test kontraktów (failing)**

`packages/contracts/src/contracts.spec.ts`:
```ts
import { randomUUID } from 'node:crypto';
import {
  AUDIENCE,
  eventBatchSchema,
  serviceClaimsSchema,
  serviceSubject,
  slugFromServiceSubject,
  worldRegistrationSchema,
  worldSlugSchema,
  worldsAccessClaimsSchema,
} from './index.js';

const now = Math.floor(Date.parse('2026-09-13T12:00:00Z') / 1000);
const joined = (overrides: Record<string, unknown> = {}) => ({
  type: 'PlayerJoinedWorld',
  eventId: randomUUID(),
  worldSlug: 'world-1',
  occurredAt: '2026-09-13T12:00:00.000Z',
  accountId: randomUUID(),
  joinedAt: '2026-09-13T12:00:00.000Z',
  ...overrides,
});

describe('kontrakty', () => {
  it('slug: małe litery, cyfry i pojedyncze myślniki, 3–40 znaków', () => {
    for (const ok of ['world-1', 'world-2-test', 'abc']) {
      expect(worldSlugSchema.safeParse(ok).success).toBe(true);
    }
    for (const bad of ['World-1', 'w1', '-world', 'world--1', 'world-', 'a'.repeat(41), 'świat-1']) {
      expect(worldSlugSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('claimy gracza wymagają aud islanders-worlds, uuid w sub i co najmniej jednej roli', () => {
    const claims = {
      iss: 'https://users.islanders.online',
      aud: AUDIENCE.worlds,
      sub: randomUUID(),
      roles: ['player'],
      nickname: 'koralowy_kapitan',
      iat: now,
      exp: now + 900,
      jti: randomUUID(),
    };
    expect(worldsAccessClaimsSchema.safeParse(claims).success).toBe(true);
    expect(worldsAccessClaimsSchema.safeParse({ ...claims, aud: AUDIENCE.tools }).success).toBe(false);
    expect(worldsAccessClaimsSchema.safeParse({ ...claims, roles: [] }).success).toBe(false);
    expect(worldsAccessClaimsSchema.safeParse({ ...claims, roles: ['king'] }).success).toBe(false);
  });

  it('podmiot serwisowy koduje slug świata w obie strony', () => {
    const sub = serviceSubject('world-2-test');
    expect(sub).toBe('service:core:world-2-test');
    expect(slugFromServiceSubject(sub)).toBe('world-2-test');
    expect(
      serviceClaimsSchema.safeParse({
        iss: 'https://users.islanders.online',
        aud: AUDIENCE.internal,
        sub,
        iat: now,
        exp: now + 300,
        jti: randomUUID(),
      }).success,
    ).toBe(true);
  });

  it('rejestracja świata odrzuca nieznane pola i zły status', () => {
    const reg = {
      name: 'Świat 1',
      publicUrl: 'https://world-1.islanders.online',
      adminUrl: 'http://core-world-1:3001',
      status: 'OPEN',
      isTest: false,
    };
    expect(worldRegistrationSchema.safeParse(reg).success).toBe(true);
    expect(worldRegistrationSchema.safeParse({ ...reg, status: 'PAUSED' }).success).toBe(false);
    expect(worldRegistrationSchema.safeParse({ ...reg, extra: 1 }).success).toBe(false);
  });

  it('partia zdarzeń: 1–100, znany typ, poprawne pola typu', () => {
    expect(eventBatchSchema.safeParse({ events: [joined()] }).success).toBe(true);
    expect(eventBatchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(
      eventBatchSchema.safeParse({ events: Array.from({ length: 101 }, () => joined()) }).success,
    ).toBe(false);
    expect(eventBatchSchema.safeParse({ events: [joined({ type: 'PlayerBanned' })] }).success).toBe(false);
    expect(eventBatchSchema.safeParse({ events: [joined({ accountId: 'nie-uuid' })] }).success).toBe(false);
  });
});
```
Run: `npm install && npm run test -w packages/contracts`
Expected: FAIL (brak `./index.js`).

- [ ] **Step 3: Implementacja**

`packages/contracts/src/slug.ts`:
```ts
import { z } from 'zod';

export const worldSlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug: małe litery, cyfry i pojedyncze myślniki');
```
`packages/contracts/src/claims.ts`:
```ts
import { z } from 'zod';

export const AUDIENCE = {
  worlds: 'islanders-worlds',
  tools: 'islanders-tools',
  internal: 'islanders-internal',
} as const;

export const ROLES = ['player', 'tester', 'admin'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

const registeredClaims = {
  iss: z.url(),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.uuid(),
};

export const worldsAccessClaimsSchema = z.object({
  ...registeredClaims,
  aud: z.literal(AUDIENCE.worlds),
  sub: z.uuid(),
  roles: z.array(roleSchema).min(1),
  nickname: z.string().min(3).max(20),
});
export type WorldsAccessClaims = z.infer<typeof worldsAccessClaimsSchema>;

export const toolsClaimsSchema = z.object({
  ...registeredClaims,
  aud: z.literal(AUDIENCE.tools),
  sub: z.uuid(),
  roles: z.array(roleSchema).min(1),
});
export type ToolsClaims = z.infer<typeof toolsClaimsSchema>;

const SERVICE_PREFIX = 'service:core:';

export const serviceClaimsSchema = z.object({
  ...registeredClaims,
  aud: z.literal(AUDIENCE.internal),
  sub: z.string().regex(/^service:core:[a-z0-9]+(-[a-z0-9]+)*$/),
});
export type ServiceClaims = z.infer<typeof serviceClaimsSchema>;

export function serviceSubject(slug: string): string {
  return `${SERVICE_PREFIX}${slug}`;
}

export function slugFromServiceSubject(sub: string): string {
  return sub.slice(SERVICE_PREFIX.length);
}
```
`packages/contracts/src/worlds.ts`:
```ts
import { z } from 'zod';
import { worldSlugSchema } from './slug.js';

export const WORLD_STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'ENDED'] as const;
export const worldStatusSchema = z.enum(WORLD_STATUSES);
export type WorldStatus = z.infer<typeof worldStatusSchema>;

export const worldRegistrationSchema = z.strictObject({
  name: z.string().min(1).max(64),
  publicUrl: z.url(),
  adminUrl: z.url(),
  status: worldStatusSchema,
  isTest: z.boolean(),
});
export type WorldRegistration = z.infer<typeof worldRegistrationSchema>;

export const worldListItemSchema = z.object({
  slug: worldSlugSchema,
  name: z.string(),
  publicUrl: z.url(),
  status: worldStatusSchema.exclude(['DRAFT']),
  isTest: z.boolean(),
  reachable: z.boolean(),
  joined: z.boolean(),
});
export type WorldListItem = z.infer<typeof worldListItemSchema>;
```
`packages/contracts/src/events.ts`:
```ts
import { z } from 'zod';
import { worldSlugSchema } from './slug.js';
import { worldStatusSchema } from './worlds.js';

export const MAX_EVENT_BATCH = 100;

const eventBase = {
  eventId: z.uuid(),
  worldSlug: worldSlugSchema,
  occurredAt: z.iso.datetime(),
};

export const worldStatusChangedSchema = z.object({
  ...eventBase,
  type: z.literal('WorldStatusChanged'),
  status: worldStatusSchema,
});

export const playerJoinedWorldSchema = z.object({
  ...eventBase,
  type: z.literal('PlayerJoinedWorld'),
  accountId: z.uuid(),
  joinedAt: z.iso.datetime(),
});

export const playerLeftWorldSchema = z.object({
  ...eventBase,
  type: z.literal('PlayerLeftWorld'),
  accountId: z.uuid(),
  leftAt: z.iso.datetime(),
});

export const worldEventSchema = z.discriminatedUnion('type', [
  worldStatusChangedSchema,
  playerJoinedWorldSchema,
  playerLeftWorldSchema,
]);
export type WorldEvent = z.infer<typeof worldEventSchema>;

export const eventBatchSchema = z.object({
  events: z.array(worldEventSchema).min(1).max(MAX_EVENT_BATCH),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;
```
`packages/contracts/src/errors.ts`:
```ts
import { z } from 'zod';

export const errorBodySchema = z.object({
  statusCode: z.number().int(),
  error: z.string().optional(),
  message: z.union([z.string(), z.array(z.string())]),
  field: z.string().optional(),
});
export type ErrorBody = z.infer<typeof errorBodySchema>;
```
`packages/contracts/src/index.ts`:
```ts
export * from './claims.js';
export * from './errors.js';
export * from './events.js';
export * from './slug.js';
export * from './worlds.js';
```
Run: `npm run test -w packages/contracts && npm run build -w packages/contracts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm test
git add -A
git commit -m "Add @islanders/contracts with token claims, world registry and event schemas"
```

---

### Task 6: Szkielet `apps/auth`: dwa porty, health, schemat i migracje

**Files:**
- Create (platform): `packages/platform/src/http/port-scope.ts` (+ `port-scope.spec.ts`), `packages/platform/src/http/internal-listener.ts`, `packages/platform/src/health/health.module.ts`
- Modify (platform): `packages/platform/src/index.ts`
- Create (auth): `apps/auth/{package.json,nest-cli.json,tsconfig.json,tsconfig.build.json,vitest.config.ts,vitest.config.e2e.ts,drizzle.config.ts,.env.example}`
- Create (auth): `apps/auth/src/config/env.ts` (+ `env.spec.ts`), `apps/auth/src/db/db.ts`, `apps/auth/src/db/schema/{accounts,refresh-tokens,worlds,world-memberships,processed-events,index}.ts`, `apps/auth/src/app.module.ts`, `apps/auth/src/bootstrap.ts`, `apps/auth/src/main.ts`, `apps/auth/src/cli/migrate.ts`
- Create (auth): `apps/auth/drizzle/*` (generowane)
- Create (auth): `apps/auth/test/support/{global-setup,test-app,vitest.d}.ts`, `apps/auth/test/health.e2e-spec.ts`
- Modify: root `package.json`

**Interfaces:**
- Consumes: platform z Tasków 3–4.
- Produces:
  - platform: `INTERNAL_REQUEST: symbol`, `portScopeMiddleware(options: PortScopeOptions)`, `interface PortScopeOptions { internalPrefixes: string[]; sharedPaths: string[] }`, `listenInternal(app: INestApplication, port: number, host?: string): Promise<Server>`, `closeServer(server: Server): Promise<void>`, `HealthModule`, `HealthController` (`GET health/live`, `GET health/ready`)
  - auth: `type AuthEnv`, `parseAuthEnv(raw)`, `AuthDbModule`, `type AuthDb`, `type AuthDbClient`, tabele `accounts`, `refreshTokens`, `worlds`, `worldMemberships`, `processedEvents`, `AppModule.forRoot(env: AuthEnv)`, `startAuth(env): Promise<{ app; internalServer }>`, `configureAuthApp(app, env)`
  - auth test: `createTestApp(options?): Promise<TestApp>`, `interface TestApp { app: INestApplication; publicHttp: () => TestAgent; internalHttp: () => TestAgent; close(): Promise<void> }`

- [ ] **Step 1: Test zakresu portów (failing)**

`packages/platform/src/http/port-scope.spec.ts`:
```ts
import { INTERNAL_REQUEST, portScopeMiddleware } from './port-scope.js';

function run(path: string, internal: boolean) {
  const mw = portScopeMiddleware({
    internalPrefixes: ['/internal', '/health'],
    sharedPaths: ['/.well-known/jwks.json'],
  });
  let status = 0;
  let nextCalled = false;
  const req = { path, method: 'GET', [INTERNAL_REQUEST]: internal } as never;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json() {
      return this;
    },
  } as never;
  mw(req, res, () => {
    nextCalled = true;
  });
  return { status, nextCalled };
}

describe('portScopeMiddleware', () => {
  it('trasa wewnętrzna na porcie publicznym -> 404', () => {
    expect(run('/internal/v1/token', false)).toEqual({ status: 404, nextCalled: false });
    expect(run('/health/ready', false)).toEqual({ status: 404, nextCalled: false });
  });
  it('trasa publiczna na porcie wewnętrznym -> 404', () => {
    expect(run('/v1/auth/login', true)).toEqual({ status: 404, nextCalled: false });
  });
  it('trasy właściwe dla portu i ścieżki wspólne przechodzą', () => {
    expect(run('/v1/auth/login', false).nextCalled).toBe(true);
    expect(run('/internal/v1/token', true).nextCalled).toBe(true);
    expect(run('/.well-known/jwks.json', false).nextCalled).toBe(true);
    expect(run('/.well-known/jwks.json', true).nextCalled).toBe(true);
  });
  it('prefiks dopasowuje całe segmenty, nie początek słowa', () => {
    expect(run('/internals', false).nextCalled).toBe(true);
  });
});
```
Run: `npm run test -w packages/platform -- port-scope`
Expected: FAIL.

- [ ] **Step 2: Zakres portów, drugi serwer, health**

`packages/platform/src/http/port-scope.ts`:
```ts
import type { NextFunction, Request, Response } from 'express';

/** Znacznik ustawiany na żądaniach przyjętych przez serwer wewnętrzny (`listenInternal`). */
export const INTERNAL_REQUEST = Symbol.for('islanders.internalRequest');

export interface PortScopeOptions {
  /** Prefiksy obsługiwane wyłącznie na porcie wewnętrznym, np. `/internal`, `/health`. */
  internalPrefixes: string[];
  /** Ścieżki dostępne na obu portach, np. `/.well-known/jwks.json`. */
  sharedPaths: string[];
}

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Jedna instancja Express obsługuje dwa serwery HTTP. Ten middleware pilnuje, żeby trasa
 * wewnętrzna nie dała się wywołać przez port publiczny i odwrotnie — odpowiedź jest taka sama
 * jak dla nieistniejącej trasy, więc port publiczny nie zdradza istnienia API wewnętrznego.
 */
export function portScopeMiddleware(options: PortScopeOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path;
    if (options.sharedPaths.some((p) => matches(path, p))) {
      next();
      return;
    }
    const internalRequest = (req as unknown as Record<symbol, unknown>)[INTERNAL_REQUEST] === true;
    const internalPath = options.internalPrefixes.some((p) => matches(path, p));
    if (internalRequest !== internalPath) {
      res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: `Cannot ${req.method} ${path}`,
      });
      return;
    }
    next();
  };
}
```
`packages/platform/src/http/internal-listener.ts`:
```ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { INTERNAL_REQUEST } from './port-scope.js';

/** Drugi serwer HTTP na tej samej instancji Express; wywołać po `app.listen`. */
export async function listenInternal(
  app: INestApplication,
  port: number,
  host?: string,
): Promise<Server> {
  const handler = app.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;
  const server = createServer((req, res) => {
    (req as unknown as Record<symbol, unknown>)[INTERNAL_REQUEST] = true;
    handler(req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}
```
`packages/platform/src/health/health.module.ts`:
```ts
import {
  Controller,
  Get,
  Inject,
  Logger,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DB } from '../db/db.module.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { withTimeout } from '../util/with-timeout.js';

const CHECK_TIMEOUT_MS = 2_000;

/**
 * `live` sprawdza tylko, że proces odpowiada. `ready` sprawdza wyłącznie zależności, bez których
 * usługa nie obsłuży żadnego żądania — własny Postgres i Redis, nigdy inne usługi.
 */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    @Inject(DB) private readonly db: PostgresJsDatabase<Record<string, never>>,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; db: 'up'; redis: 'up' }> {
    const db = await this.probe('db', () => this.db.execute(sql`SELECT 1`));
    const redis = await this.probe('redis', () => this.redis.ping());
    if (db === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'down', db, redis });
    }
    return { status: 'ok', db, redis };
  }

  private async probe(name: string, check: () => Promise<unknown>): Promise<'up' | 'down'> {
    try {
      await withTimeout(check(), CHECK_TIMEOUT_MS);
      return 'up';
    } catch (err) {
      this.logger.error(`${name} niedostępny`, err instanceof Error ? err.message : String(err));
      return 'down';
    }
  }
}

/** Wymaga w aplikacji modułu bazy i RedisModule. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
```
W `packages/platform/src/index.ts` dopisz:
```ts
export * from './health/health.module.js';
export * from './http/internal-listener.js';
export * from './http/port-scope.js';
```
Run: `npm run test -w packages/platform && npm run build -w packages/platform`
Expected: PASS.

- [ ] **Step 3: Pakiet `apps/auth`**

`apps/auth/package.json`:
```json
{
  "name": "@islanders/auth",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "prebuild": "npm run build:packages --prefix ../..",
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "test": "vitest run",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "nest build && node dist/cli/migrate.js",
    "account:roles": "node dist/cli/accounts.js roles",
    "account:set-password": "node dist/cli/accounts.js set-password",
    "account:disable": "node dist/cli/accounts.js disable",
    "account:enable": "node dist/cli/accounts.js enable",
    "keys:generate": "node dist/cli/keys-generate.js",
    "client:create": "node dist/cli/client-create.js"
  },
  "dependencies": {
    "@islanders/contracts": "0.0.1",
    "@islanders/domain": "0.0.1",
    "@islanders/platform": "0.0.1",
    "@nestjs/common": "^12.0.1",
    "@nestjs/core": "^12.0.1",
    "@nestjs/platform-express": "^12.0.1",
    "@nestjs/swagger": "^12.0.1",
    "argon2": "^0.45.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "drizzle-orm": "^0.45.2",
    "ioredis": "^6.0.0",
    "jose": "^6.2.12",
    "postgres": "^3.4.9",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "zod": "^4.5.4"
  },
  "devDependencies": {
    "@nestjs/cli": "^12.0.0",
    "@nestjs/schematics": "^12.0.0",
    "@nestjs/testing": "^12.0.1",
    "@testcontainers/postgresql": "^12.1.0",
    "@testcontainers/redis": "^12.1.0",
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "@types/supertest": "^7.0.0",
    "drizzle-kit": "^0.31.10",
    "supertest": "^7.0.0",
    "typescript": "^6.0.2",
    "vitest": "^4.1.2"
  }
}
```
`apps/auth/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true, "plugins": ["@nestjs/swagger"] }
}
```
`apps/auth/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "incremental": true }
}
```
`apps/auth/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": "./src" },
  "include": ["src"],
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```
`apps/auth/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['reflect-metadata'],
  },
});
```
`apps/auth/vitest.config.e2e.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['reflect-metadata'],
    globalSetup: ['./test/support/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
```
`apps/auth/drizzle.config.ts`:
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://islanders:islanders@localhost:5432/islanders_auth',
  },
  strict: true,
  verbose: true,
});
```
Root `package.json`: `"workspaces": ["packages/domain", "packages/contracts", "packages/platform", "apps/core", "apps/auth"]`.

- [ ] **Step 4: Konfiguracja — test (failing)**

`apps/auth/src/config/env.spec.ts`:
```ts
import { EnvValidationError } from '@islanders/platform';
import { parseAuthEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders_auth',
  AUTH_ISSUER: 'https://users.islanders.online',
  JWT_SIGNING_KEYS: '[]',
  SERVICE_CLIENTS: '[]',
};

describe('parseAuthEnv', () => {
  it('stosuje wartości domyślne portów, TTL i sondy', () => {
    const env = parseAuthEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.ADMIN_PORT).toBe(3001);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(30 * 24 * 3600);
    expect(env.WORLD_PROBE_INTERVAL).toBe(30);
  });

  it('odrzuca brak AUTH_ISSUER i JWT_SIGNING_KEYS niebędący JSON-em', () => {
    const { AUTH_ISSUER: _drop, ...noIssuer } = base;
    expect(() => parseAuthEnv(noIssuer)).toThrow(/AUTH_ISSUER/);
    expect(() => parseAuthEnv({ ...base, JWT_SIGNING_KEYS: 'nie-json' })).toThrow(EnvValidationError);
  });
});
```
Run: `npm install && npm run build:packages && npm run test -w apps/auth`
Expected: FAIL.

- [ ] **Step 5: Konfiguracja — implementacja**

`apps/auth/src/config/env.ts`:
```ts
import { z } from 'zod';
import {
  baseEnvShape,
  durationSchema,
  durationToSeconds,
  parseEnvWith,
  withSwaggerDefault,
} from '@islanders/platform';

/** Surowy JSON; kształt wpisów waliduje moduł, który z nich korzysta (klucze, klienci serwisowi). */
const jsonArray = z.string().transform((text, ctx) => {
  try {
    const value: unknown = JSON.parse(text);
    if (Array.isArray(value)) return value as unknown[];
  } catch {
    // niżej wspólny komunikat
  }
  ctx.addIssue({ code: 'custom', message: 'musi być tablicą JSON' });
  return z.NEVER;
});

export const authEnvSchema = z
  .object({
    ...baseEnvShape,
    ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    AUTH_ISSUER: z.url(),
    JWT_SIGNING_KEYS: jsonArray,
    JWT_ACCESS_TTL: durationSchema.default('15m').transform(durationToSeconds),
    JWT_REFRESH_TTL: durationSchema.default('30d').transform(durationToSeconds),
    SERVICE_CLIENTS: jsonArray.default([]),
    WORLD_PROBE_INTERVAL: durationSchema.default('30s').transform(durationToSeconds),
  })
  .transform(withSwaggerDefault);

export type AuthEnv = z.output<typeof authEnvSchema>;

export function parseAuthEnv(raw: Record<string, string | undefined>): AuthEnv {
  return parseEnvWith(authEnvSchema, raw);
}
```
Uwaga: `SERVICE_CLIENTS: jsonArray.default([])` — w zod 4 `.default` na schemacie z transformacją przyjmuje wartość wyjściową; jeśli kompilator zgłosi błąd typu, użyj `z.string().default('[]').pipe(jsonArray)`.

Run: `npm run test -w apps/auth`
Expected: PASS.

- [ ] **Step 6: Schemat bazy**

`apps/auth/src/db/schema/accounts.ts`:
```ts
import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from '@islanders/platform/citext';

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull().unique(),
    nickname: citext('nickname').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    roles: text('roles').array().notNull().default(sql`'{player}'::text[]`),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'accounts_roles_valid',
      sql`${t.roles} <@ ARRAY['player','tester','admin']::text[] AND 'player' = ANY(${t.roles})`,
    ),
  ],
);
```
`apps/auth/src/db/schema/refresh-tokens.ts`:
```ts
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
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
`apps/auth/src/db/schema/worlds.ts`:
```ts
import { boolean, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { WORLD_STATUSES } from '@islanders/contracts';

export const worldStatus = pgEnum('world_status', WORLD_STATUSES);

export const worlds = pgTable('worlds', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  publicUrl: text('public_url').notNull(),
  adminUrl: text('admin_url').notNull(),
  status: worldStatus('status').notNull(),
  isTest: boolean('is_test').notNull(),
  reachable: boolean('reachable').notNull().default(false),
  lastProbeAt: timestamp('last_probe_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```
`apps/auth/src/db/schema/world-memberships.ts`:
```ts
import { pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { worlds } from './worlds.js';

export const worldMemberships = pgTable(
  'world_memberships',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    worldSlug: text('world_slug')
      .notNull()
      .references(() => worlds.slug, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.worldSlug] })],
);
```
`apps/auth/src/db/schema/processed-events.ts`:
```ts
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const processedEvents = pgTable('processed_events', {
  eventId: uuid('event_id').primaryKey(),
  worldSlug: text('world_slug').notNull(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
```
`apps/auth/src/db/schema/index.ts`:
```ts
export * from './accounts.js';
export * from './processed-events.js';
export * from './refresh-tokens.js';
export * from './world-memberships.js';
export * from './worlds.js';
```
`apps/auth/src/db/db.ts`:
```ts
import { DbModule } from '@islanders/platform';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';

export { DB, PG_CLIENT } from '@islanders/platform';

export type AuthDb = PostgresJsDatabase<typeof schema>;
/** Baza albo transakcja. */
export type AuthDbClient = AuthDb | Parameters<Parameters<AuthDb['transaction']>[0]>[0];

export const AuthDbModule = DbModule.forRoot(schema);
```

- [ ] **Step 7: Migracje**

```bash
cd apps/auth
npx drizzle-kit generate --custom --name citext_extension
```
Wpisz do wygenerowanego `apps/auth/drizzle/0000_citext_extension.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS citext;
```
```bash
npx drizzle-kit generate --name initial_schema
cd ../..
```
Expected: `apps/auth/drizzle/0001_initial_schema.sql` z tabelami `accounts`, `refresh_tokens`, `worlds`, `world_memberships`, `processed_events`, typem `world_status` i ograniczeniem `accounts_roles_valid`.

`apps/auth/src/cli/migrate.ts`:
```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runMigrations } from '@islanders/platform';
import { parseAuthEnv } from '../config/env.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const env = parseAuthEnv(process.env);
await runMigrations(env.DATABASE_URL, path.resolve(process.cwd(), 'drizzle'));
console.log('Migracje auth zastosowane.');
```

- [ ] **Step 8: Moduł, bootstrap, main**

`apps/auth/src/app.module.ts`:
```ts
import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  AllExceptionsFilter,
  AppConfigModule,
  HealthModule,
  RateLimitModule,
  RedisModule,
  ServerTimeInterceptor,
  TimeModule,
} from '@islanders/platform';
import type { AuthEnv } from './config/env.js';
import { AuthDbModule } from './db/db.js';

@Module({})
export class AppModule {
  static forRoot(env: AuthEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        AuthDbModule,
        RedisModule,
        TimeModule,
        RateLimitModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ServerTimeInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
```
`apps/auth/src/bootstrap.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import { configureApp, portScopeMiddleware } from '@islanders/platform';
import type { AuthEnv } from './config/env.js';

/** Konfiguracja wspólna dla main.ts i testów e2e. Wywołać przed `app.listen`. */
export function configureAuthApp(app: INestApplication, env: AuthEnv): void {
  // Najpierw nagłówek czasu i sufit po adresie (w configureApp), potem zakres portu —
  // odpowiedź 404 z zakresu portu też niesie X-Server-Time.
  configureApp(app, {
    env,
    swagger: {
      title: 'Islanders Auth',
      description: 'Konta, tokeny i rejestr światów. Trasy /internal/* tylko na porcie wewnętrznym.',
      tags: ['auth', 'worlds', 'internal', 'health'],
      path: 'docs',
    },
  });
  app.use(
    portScopeMiddleware({
      internalPrefixes: ['/internal', '/health'],
      sharedPaths: ['/.well-known/jwks.json'],
    }),
  );
}
```
Uwaga: Swagger UI (`/docs`) jest poza `internalPrefixes`, więc działa na porcie publicznym tylko przy `SWAGGER_ENABLED=true` (domyślnie wyłączony w produkcji).

`apps/auth/src/main.ts`:
```ts
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
```

- [ ] **Step 9: Harness e2e**

`apps/auth/test/support/vitest.d.ts`:
```ts
declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    redisUrl: string;
  }
}
export {};
```
`apps/auth/test/support/global-setup.ts`:
```ts
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '@islanders/platform';

let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  postgres = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = postgres.getConnectionUri();
  project.provide('databaseUrl', url);
  await runMigrations(url, path.resolve(process.cwd(), 'drizzle'));

  redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await postgres?.stop();
  await redis?.stop();
}
```
`apps/auth/test/support/test-app.ts`:
```ts
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
    JWT_SIGNING_KEYS: '[]',
    SERVICE_CLIENTS: '[]',
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
```

- [ ] **Step 10: E2E health i zakres portów (failing → passing)**

`apps/auth/test/health.e2e-spec.ts`:
```ts
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: health i zakres portów (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('health/live i health/ready na porcie wewnętrznym', async () => {
    await t.internalHttp().get('/health/live').expect(200, /"status":"ok"/);
    const ready = await t.internalHttp().get('/health/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
  });

  it('health niedostępny na porcie publicznym', async () => {
    await t.publicHttp().get('/health/ready').expect(404);
  });

  it('nieistniejąca trasa wewnętrzna na porcie publicznym daje to samo 404 co każda inna', async () => {
    const internal = await t.publicHttp().post('/internal/v1/token').send({}).expect(404);
    const missing = await t.publicHttp().post('/nie/istnieje').send({}).expect(404);
    expect(Object.keys(internal.body).sort()).toEqual(Object.keys(missing.body).sort());
  });
});
```
Run: `npm run build:packages && npm run test:e2e -w apps/auth`
Expected: PASS.

- [ ] **Step 11: Testy całości i commit**

```bash
npm test && npm run test:e2e && npm run build && npm run lint
git add -A
git commit -m "Add the auth service skeleton with public and internal ports, health checks and its schema"
```

---

### Task 7: Konta i tokeny EdDSA z JWKS

**Files:**
- Create: `apps/auth/src/keys/signing-keys.ts` (+ `signing-keys.spec.ts`), `apps/auth/src/keys/generate-signing-key.ts`
- Create: `apps/auth/src/tokens/{token-issuer,token-verifier,jwks.controller,tokens.module}.ts`
- Create: `apps/auth/src/accounts/{refresh-tokens,accounts.repository,refresh-tokens.repository,auth.dto,auth.service,auth.controller,accounts.module}.ts`
- Create: `apps/auth/test/support/{keys,fixtures}.ts`, `apps/auth/test/auth.e2e-spec.ts`
- Modify: `apps/auth/src/app.module.ts`, `apps/auth/test/support/test-app.ts`

**Interfaces:**
- Consumes: `AuthEnv`, `AuthDb`, `AuthDbClient`, tabele (Task 6); `AUDIENCE`, `worldsAccessClaimsSchema`, `toolsClaimsSchema`, `serviceClaimsSchema`, `Role` (Task 5); `CLOCK`, `DB`, `ENV`, `RateLimit`, `RateLimitGuard`, `isUniqueViolation` (platform).
- Produces:
  - `signingKeyEntrySchema`, `type SigningKeyEntry = { kid: string; privateJwk: JWK; status: 'active' | 'retiring' }`, `parseSigningKeys(entries: unknown[]): SigningKeyEntry[]` (rzuca `Error`), `publicJwks(entries): JWK[]`, `SIGNING_KEYS: symbol`, `interface SigningKeys { activeKid: string; activeKey: CryptoKey; jwks: { keys: JWK[] } }`, `loadSigningKeys(entries): Promise<SigningKeys>`
  - `generateSigningKeyEntry(now?: Date): Promise<SigningKeyEntry>`
  - `TokenIssuer.worldsAccess(account: TokenAccount): Promise<IssuedToken>`, `.tools(account): Promise<IssuedToken>`, `.service(worldSlug: string): Promise<IssuedToken>`; `interface TokenAccount { id: string; roles: Role[]; nickname: string }`; `interface IssuedToken { token: string; expiresAt: Date }`
  - `TokenVerifier.verify<A extends keyof typeof AUDIENCE>(token: string, audience: A): Promise<ClaimsFor<A>>` (rzuca `UnauthorizedException`)
  - `TOOLS_TOKEN_TTL_SECONDS = 3600`, `SERVICE_TOKEN_TTL_SECONDS = 300`
  - `AccountsRepository`: `create`, `findByEmail`, `findById`, `setRoles(id, roles)`, `setPasswordHash(id, hash)`, `setDisabledAt(id, at: Date | null)`; `type AccountRow`
  - `RefreshTokensRepository`: `create(client, input)`, `findByHashForUpdate(client, hash)`, `findByHash(hash)`, `revoke(client, id, at, replacedById)`, `revokeAllForAccount(client, accountId, at)`
  - `ARGON2_OPTIONS`, `AuthService.register|login|refresh|logout`, `type AuthResult = { accountId: string; nickname: string; roles: Role[]; accessToken: string; refreshToken: string }`
  - `TokensModule` (globalny: `SIGNING_KEYS`, `TokenIssuer`, `TokenVerifier`, `JwksController`), `AccountsModule`
  - test: `testSigningKeys: { active: SigningKeyEntry; other: SigningKeyEntry }`, `keysEnv(...entries): string`, `registerAccount(t: TestApp, overrides?)`, `uniqueSuffix()`, `bearer(token)`

- [ ] **Step 1: Test kluczy (failing)**

`apps/auth/src/keys/signing-keys.spec.ts`:
```ts
import { SignJWT, createLocalJWKSet, jwtVerify } from 'jose';
import { generateSigningKeyEntry } from './generate-signing-key.js';
import { loadSigningKeys, parseSigningKeys, publicJwks } from './signing-keys.js';

describe('klucze podpisu', () => {
  it('odrzuca zestaw bez klucza aktywnego i z dwoma aktywnymi', async () => {
    const a = await generateSigningKeyEntry();
    const b = await generateSigningKeyEntry();
    expect(() => parseSigningKeys([{ ...a, status: 'retiring' }])).toThrow(/dokładnie jeden aktywny/);
    expect(() => parseSigningKeys([a, b])).toThrow(/dokładnie jeden aktywny/);
    expect(() => parseSigningKeys([])).toThrow(/dokładnie jeden aktywny/);
  });

  it('odrzuca JWK bez części prywatnej, zły typ klucza i powtórzony kid', async () => {
    const a = await generateSigningKeyEntry();
    const { d: _d, ...publicOnly } = a.privateJwk;
    expect(() => parseSigningKeys([{ ...a, privateJwk: publicOnly }])).toThrow();
    expect(() => parseSigningKeys([{ ...a, privateJwk: { ...a.privateJwk, crv: 'P-256' } }])).toThrow();
    expect(() => parseSigningKeys([a, { ...a, status: 'retiring' }])).toThrow(/kid/);
  });

  it('JWKS zawiera wszystkie klucze bez części prywatnej', async () => {
    const a = await generateSigningKeyEntry();
    const b = { ...(await generateSigningKeyEntry()), status: 'retiring' as const };
    const jwks = publicJwks(parseSigningKeys([a, b]));
    expect(jwks.map((k) => k.kid).sort()).toEqual([a.kid, b.kid].sort());
    for (const k of jwks) {
      expect(k.d).toBeUndefined();
      expect(k).toMatchObject({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' });
    }
  });

  it('token podpisany kluczem aktywnym weryfikuje się przez JWKS', async () => {
    const keys = await loadSigningKeys([await generateSigningKeyEntry()]);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'EdDSA', kid: keys.activeKid })
      .setIssuer('https://users.islanders.test')
      .setAudience('islanders-worlds')
      .setExpirationTime('5m')
      .sign(keys.activeKey);
    const { payload } = await jwtVerify(token, createLocalJWKSet(keys.jwks), {
      issuer: 'https://users.islanders.test',
      audience: 'islanders-worlds',
    });
    expect(payload.aud).toBe('islanders-worlds');
  });
});
```
Run: `npm run test -w apps/auth -- signing-keys`
Expected: FAIL.

- [ ] **Step 2: Implementacja kluczy**

`apps/auth/src/keys/signing-keys.ts`:
```ts
import { importJWK, type JWK } from 'jose';
import { z } from 'zod';

export const SIGNING_KEYS = Symbol('SIGNING_KEYS');

export const signingKeyEntrySchema = z.object({
  kid: z.string().min(1).max(64),
  privateJwk: z.looseObject({
    kty: z.literal('OKP'),
    crv: z.literal('Ed25519'),
    x: z.string().min(1),
    d: z.string().min(1),
  }),
  status: z.enum(['active', 'retiring']),
});
export type SigningKeyEntry = z.infer<typeof signingKeyEntrySchema>;

export interface SigningKeys {
  activeKid: string;
  activeKey: CryptoKey;
  jwks: { keys: JWK[] };
}

/** Waliduje JWT_SIGNING_KEYS: dokładnie jeden aktywny klucz Ed25519, unikalne `kid`. */
export function parseSigningKeys(entries: unknown[]): SigningKeyEntry[] {
  const parsed = z.array(signingKeyEntrySchema).parse(entries);
  if (parsed.filter((e) => e.status === 'active').length !== 1) {
    throw new Error('JWT_SIGNING_KEYS: wymagany dokładnie jeden aktywny klucz');
  }
  if (new Set(parsed.map((e) => e.kid)).size !== parsed.length) {
    throw new Error('JWT_SIGNING_KEYS: powtórzony kid');
  }
  return parsed;
}

/** Klucz wycofywany zostaje w JWKS, dopóki mogą żyć podpisane nim tokeny. */
export function publicJwks(entries: SigningKeyEntry[]): JWK[] {
  return entries.map(({ kid, privateJwk }) => ({
    kty: privateJwk.kty,
    crv: privateJwk.crv,
    x: privateJwk.x,
    kid,
    alg: 'EdDSA',
    use: 'sig',
  }));
}

export async function loadSigningKeys(entries: unknown[]): Promise<SigningKeys> {
  const parsed = parseSigningKeys(entries);
  const active = parsed.find((e) => e.status === 'active')!;
  const activeKey = (await importJWK(active.privateJwk as JWK, 'EdDSA')) as CryptoKey;
  return { activeKid: active.kid, activeKey, jwks: { keys: publicJwks(parsed) } };
}
```
`apps/auth/src/keys/generate-signing-key.ts`:
```ts
import { randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import type { SigningKeyEntry } from './signing-keys.js';

/** Nowy aktywny wpis do JWT_SIGNING_KEYS. `kid` z datą ułatwia rotację ręczną. */
export async function generateSigningKeyEntry(now: Date = new Date()): Promise<SigningKeyEntry> {
  const { privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const jwk = await exportJWK(privateKey);
  const kid = `k-${now.toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;
  return {
    kid,
    privateJwk: { ...jwk, kty: 'OKP', crv: 'Ed25519', x: jwk.x!, d: jwk.d! },
    status: 'active',
  };
}
```
Run: `npm run test -w apps/auth -- signing-keys`
Expected: PASS.

- [ ] **Step 3: Wystawca, weryfikator, JWKS**

`apps/auth/src/tokens/token-issuer.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { AUDIENCE, serviceSubject, type Role } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { SIGNING_KEYS, type SigningKeys } from '../keys/signing-keys.js';

export const TOOLS_TOKEN_TTL_SECONDS = 3600;
export const SERVICE_TOKEN_TTL_SECONDS = 300;

export interface TokenAccount {
  id: string;
  roles: Role[];
  nickname: string;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenIssuer {
  constructor(
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
    @Inject(ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  worldsAccess(account: TokenAccount): Promise<IssuedToken> {
    return this.sign(
      { roles: account.roles, nickname: account.nickname },
      AUDIENCE.worlds,
      account.id,
      this.env.JWT_ACCESS_TTL,
    );
  }

  tools(account: TokenAccount): Promise<IssuedToken> {
    return this.sign({ roles: account.roles }, AUDIENCE.tools, account.id, TOOLS_TOKEN_TTL_SECONDS);
  }

  service(worldSlug: string): Promise<IssuedToken> {
    return this.sign({}, AUDIENCE.internal, serviceSubject(worldSlug), SERVICE_TOKEN_TTL_SECONDS);
  }

  private async sign(
    claims: Record<string, unknown>,
    audience: string,
    subject: string,
    ttlSeconds: number,
  ): Promise<IssuedToken> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + ttlSeconds;
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: this.keys.activeKid, typ: 'JWT' })
      .setIssuer(this.env.AUTH_ISSUER)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .setJti(randomUUID())
      .sign(this.keys.activeKey);
    return { token, expiresAt: new Date(exp * 1000) };
  }
}
```
`apps/auth/src/tokens/token-verifier.ts`:
```ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createLocalJWKSet, jwtVerify } from 'jose';
import type { z } from 'zod';
import {
  AUDIENCE,
  serviceClaimsSchema,
  toolsClaimsSchema,
  worldsAccessClaimsSchema,
} from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { SIGNING_KEYS, type SigningKeys } from '../keys/signing-keys.js';

const SCHEMAS = {
  worlds: worldsAccessClaimsSchema,
  tools: toolsClaimsSchema,
  internal: serviceClaimsSchema,
} as const;

export type ClaimsFor<A extends keyof typeof AUDIENCE> = z.infer<(typeof SCHEMAS)[A]>;

/** Weryfikacja identyczna z tą, którą wykona core: JWKS, iss, aud, exp, a potem kształt claimów. */
@Injectable()
export class TokenVerifier {
  private readonly jwks: ReturnType<typeof createLocalJWKSet>;

  constructor(
    @Inject(SIGNING_KEYS) keys: SigningKeys,
    @Inject(ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.jwks = createLocalJWKSet(keys.jwks);
  }

  async verify<A extends keyof typeof AUDIENCE>(token: string, audience: A): Promise<ClaimsFor<A>> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.env.AUTH_ISSUER,
        audience: AUDIENCE[audience],
        algorithms: ['EdDSA'],
        currentDate: this.clock.now(),
      });
      return SCHEMAS[audience].parse(payload) as ClaimsFor<A>;
    } catch {
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
  }
}
```
`apps/auth/src/tokens/jwks.controller.ts`:
```ts
import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SIGNING_KEYS, type SigningKeys } from '../keys/signing-keys.js';

@ApiTags('auth')
@Controller('.well-known')
export class JwksController {
  constructor(@Inject(SIGNING_KEYS) private readonly keys: SigningKeys) {}

  @Get('jwks.json')
  @Header('Cache-Control', 'public, max-age=300')
  jwks(): SigningKeys['jwks'] {
    return this.keys.jwks;
  }
}
```
Uwaga: `ServerTimeInterceptor` dopisuje `serverTime` do obiektów. Odpowiedź JWKS to obiekt, a `createLocalJWKSet` i `createRemoteJWKSet` ignorują nieznane pola, więc zostawiamy to bez wyjątków.

`apps/auth/src/tokens/tokens.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { SIGNING_KEYS, loadSigningKeys } from '../keys/signing-keys.js';
import { JwksController } from './jwks.controller.js';
import { TokenIssuer } from './token-issuer.js';
import { TokenVerifier } from './token-verifier.js';

@Global()
@Module({
  controllers: [JwksController],
  providers: [
    {
      provide: SIGNING_KEYS,
      inject: [ENV],
      useFactory: (env: AuthEnv) => loadSigningKeys(env.JWT_SIGNING_KEYS),
    },
    TokenIssuer,
    TokenVerifier,
  ],
  exports: [SIGNING_KEYS, TokenIssuer, TokenVerifier],
})
export class TokensModule {}
```

- [ ] **Step 4: Repozytoria i funkcje tokenu odświeżającego**

`apps/auth/src/accounts/refresh-tokens.ts`:
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
`apps/auth/src/accounts/accounts.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Role } from '@islanders/contracts';
import { DB, type AuthDb, type AuthDbClient } from '../db/db.js';
import { accounts } from '../db/schema/index.js';

export type AccountRow = typeof accounts.$inferSelect & { roles: Role[] };

@Injectable()
export class AccountsRepository {
  constructor(@Inject(DB) private readonly db: AuthDb) {}

  /** Rzuca 23505 (accounts_email_unique / accounts_nickname_unique) przy duplikacie. */
  async create(input: { email: string; nickname: string; passwordHash: string }): Promise<AccountRow> {
    const [row] = await this.db.insert(accounts).values(input).returning();
    return row as AccountRow;
  }

  async findByEmail(email: string): Promise<AccountRow | undefined> {
    return (await this.db.query.accounts.findFirst({ where: eq(accounts.email, email) })) as
      | AccountRow
      | undefined;
  }

  async findById(id: string, client: AuthDbClient = this.db): Promise<AccountRow | undefined> {
    const [row] = await client.select().from(accounts).where(eq(accounts.id, id));
    return row as AccountRow | undefined;
  }

  async setRoles(id: string, roles: Role[]): Promise<void> {
    await this.db.update(accounts).set({ roles }).where(eq(accounts.id, id));
  }

  async setPasswordHash(client: AuthDbClient, id: string, passwordHash: string): Promise<void> {
    await client.update(accounts).set({ passwordHash }).where(eq(accounts.id, id));
  }

  async setDisabledAt(client: AuthDbClient, id: string, at: Date | null): Promise<void> {
    await client.update(accounts).set({ disabledAt: at }).where(eq(accounts.id, id));
  }
}
```
`apps/auth/src/accounts/refresh-tokens.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type AuthDb, type AuthDbClient } from '../db/db.js';
import { refreshTokens } from '../db/schema/index.js';

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(DB) private readonly db: AuthDb) {}

  async create(
    client: AuthDbClient,
    input: { accountId: string; tokenHash: string; expiresAt: Date },
  ): Promise<RefreshTokenRow> {
    const [row] = await client.insert(refreshTokens).values(input).returning();
    return row;
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    return row;
  }

  /** Blokuje wiersz do końca transakcji: dwa równoległe odświeżenia tym samym tokenem idą po kolei. */
  async findByHashForUpdate(client: AuthDbClient, tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const [row] = await client
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for('update');
    return row;
  }

  /** `replacedById` ustawione = rotacja (podlega oknu łaski); brak = logout (natychmiastowe). */
  async revoke(client: AuthDbClient, id: string, at: Date, replacedById: string | null): Promise<void> {
    await client.update(refreshTokens).set({ revokedAt: at, replacedById }).where(eq(refreshTokens.id, id));
  }

  async revokeAllForAccount(client: AuthDbClient, accountId: string, at: Date): Promise<void> {
    await client
      .update(refreshTokens)
      .set({ revokedAt: at, replacedById: null })
      .where(and(eq(refreshTokens.accountId, accountId), isNull(refreshTokens.revokedAt)));
  }
}
```

- [ ] **Step 5: DTO, serwis, kontroler, moduł**

`apps/auth/src/accounts/auth.dto.ts` — skopiuj `apps/core/src/modules/auth/auth.dto.ts` bez zmian w klasach `RegisterDto`, `LoginDto`, `RefreshDto`, `TokenPairDto`, `ConflictFieldDto`, a `AuthResultDto` zastąp:
```ts
export class AuthResultDto {
  @ApiProperty({ format: 'uuid' }) accountId!: string;
  @ApiProperty() nickname!: string;
  @ApiProperty({ isArray: true, enum: ['player', 'tester', 'admin'] }) roles!: string[];
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
}

export class ToolsTokenDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() expiresAt!: string;
}
```
`apps/auth/src/accounts/auth.service.ts`:
```ts
import {
  ConflictException,
  Inject,
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { Role } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, DB, ENV, isUniqueViolation } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import type { AuthDb, AuthDbClient } from '../db/db.js';
import { TokenIssuer } from '../tokens/token-issuer.js';
import { AccountsRepository, type AccountRow } from './accounts.repository.js';
import { REFRESH_GRACE_MS, generateRefreshToken, hashRefreshToken } from './refresh-tokens.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

export interface AuthResult {
  accountId: string;
  nickname: string;
  roles: Role[];
  accessToken: string;
  refreshToken: string;
}

const BAD_CREDENTIALS = 'Błędny e-mail lub hasło';

/**
 * Te same parametry przy rejestracji i przy atrapie — inaczej czasy się rozjadą. Koszty jawnie,
 * bo zmiana domyślnych wartości argon2 rozjechałaby koszt atrapy z kosztem zapisanych skrótów
 * i kanał czasowy wróciłby po cichu. Wartości = domyślne argon2 0.45.1.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

const DUMMY_PASSWORD = 'atrapa-hasla-do-wyrownania-czasu';

@Injectable()
export class AuthService implements OnModuleInit {
  /** Atrapa dla nieznanego konta. NIE USUWAĆ: wyrównuje czas odpowiedzi (spec A §8). */
  private dummyPasswordHash: string;

  constructor(
    private readonly accounts: AccountsRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly issuer: TokenIssuer,
    @Inject(DB) private readonly db: AuthDb,
    @Inject(ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(DUMMY_PASSWORD, ARGON2_OPTIONS);
  }

  async register(input: { email: string; nickname: string; password: string }): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    let account: AccountRow;
    try {
      account = await this.accounts.create({ ...input, passwordHash });
    } catch (err) {
      if (isUniqueViolation(err, 'accounts_email_unique')) {
        throw this.conflict('E-mail jest już zajęty', 'email');
      }
      if (isUniqueViolation(err, 'accounts_nickname_unique')) {
        throw this.conflict('Pseudonim jest już zajęty', 'nickname');
      }
      throw err;
    }
    return this.issueInTransaction(account);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    return this.issueInTransaction(await this.verifyCredentials(input));
  }

  private async issueInTransaction(account: AccountRow): Promise<AuthResult> {
    const { refreshTokenId: _id, ...result } = await this.db.transaction((tx) =>
      this.issue(tx, account),
    );
    return result;
  }

  /** Wspólne dla logowania gracza i logowania do tools. Zablokowane konto: ta sama treść 401. */
  async verifyCredentials(input: { email: string; password: string }): Promise<AccountRow> {
    const account = await this.accounts.findByEmail(input.email);
    if (!account) {
      await argon2.verify(this.dummyPasswordHash, input.password);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    if (!(await argon2.verify(account.passwordHash, input.password)) || account.disabledAt) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    return account;
  }

  /** Rotacja w jednej transakcji z blokadą wiersza starego tokenu (spec A §15.1). */
  refresh(refreshToken: string): Promise<AuthResult> {
    return this.db.transaction(async (tx) => {
      const now = this.clock.now();
      const row = await this.refreshTokens.findByHashForUpdate(tx, hashRefreshToken(refreshToken));
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
      const account = await this.accounts.findById(row.accountId, tx);
      if (!account || account.disabledAt) {
        throw new UnauthorizedException('Refresh token nieważny');
      }
      const result = await this.issue(tx, account);
      // Token wydany w oknie łaski nie jest linkowany z `replacedById`: kolumna zapisuje tylko
      // pierwsze ogniwo, a nadpisanie przesunęłoby `revokedAt`, czyli przedłużyło okno.
      if (!row.revokedAt) {
        await this.refreshTokens.revoke(tx, row.id, now, result.refreshTokenId);
      }
      const { refreshTokenId: _id, ...out } = result;
      return out;
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!row) return;
    if (!row.revokedAt) {
      await this.refreshTokens.revoke(this.db, row.id, this.clock.now(), null);
      return;
    }
    if (row.replacedById !== null) {
      // Wylogowanie starym tokenem w oknie łaski: zdejmujemy znacznik rotacji, zachowując `revokedAt`.
      await this.refreshTokens.revoke(this.db, row.id, row.revokedAt, null);
    }
  }

  private async issue(
    client: AuthDbClient,
    account: AccountRow,
  ): Promise<AuthResult & { refreshTokenId: string }> {
    const now = this.clock.now();
    const access = await this.issuer.worldsAccess(account);
    const refreshToken = generateRefreshToken();
    const row = await this.refreshTokens.create(client, {
      accountId: account.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.env.JWT_REFRESH_TTL * 1000),
    });
    return {
      accountId: account.id,
      nickname: account.nickname,
      roles: account.roles,
      accessToken: access.token,
      refreshToken,
      refreshTokenId: row.id,
    };
  }

  private conflict(message: string, field: string): ConflictException {
    return new ConflictException({ statusCode: 409, error: 'Conflict', message, field });
  }
}
```
`apps/auth/src/accounts/auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RateLimit, RateLimitGuard } from '@islanders/platform';
import {
  AuthResultDto,
  ConflictFieldDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  TokenPairDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('v1/auth')
@UseGuards(RateLimitGuard)
@RateLimit('ip')
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
`apps/auth/src/accounts/accounts.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AccountsRepository } from './accounts.repository.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

@Module({
  controllers: [AuthController],
  providers: [AccountsRepository, RefreshTokensRepository, AuthService],
  exports: [AccountsRepository, RefreshTokensRepository, AuthService],
})
export class AccountsModule {}
```
W `apps/auth/src/app.module.ts` dodaj do `imports` (po `HealthModule`): `TokensModule`, `AccountsModule`.

- [ ] **Step 6: Wsparcie testów**

`apps/auth/test/support/keys.ts`:
```ts
import { generateSigningKeyEntry } from '../../src/keys/generate-signing-key.js';
import type { SigningKeyEntry } from '../../src/keys/signing-keys.js';

/** Generowane raz na proces testów; `other` służy do testów rotacji. */
export const testSigningKeys = {
  active: await generateSigningKeyEntry(new Date('2026-09-01T00:00:00Z')),
  other: await generateSigningKeyEntry(new Date('2026-09-02T00:00:00Z')),
};

export function keysEnv(...entries: SigningKeyEntry[]): string {
  return JSON.stringify(entries);
}
```
W `apps/auth/test/support/test-app.ts`: import `import { keysEnv, testSigningKeys } from './keys.js';` i zamień `JWT_SIGNING_KEYS: '[]'` na `JWT_SIGNING_KEYS: keysEnv(testSigningKeys.active)`.

`apps/auth/test/support/fixtures.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { TestApp } from './test-app.js';

export function uniqueSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export interface RegisteredAccount {
  accountId: string;
  nickname: string;
  roles: string[];
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerAccount(
  t: TestApp,
  overrides: Partial<{ email: string; nickname: string; password: string }> = {},
): Promise<RegisteredAccount> {
  const suffix = uniqueSuffix();
  const body = {
    email: overrides.email ?? `a-${suffix}@test.local`,
    nickname: overrides.nickname ?? `a_${suffix}`,
    password: overrides.password ?? 'haslo-testowe-123',
  };
  const res = await t.publicHttp().post('/v1/auth/register').send(body).expect(201);
  return { ...res.body, email: body.email, password: body.password };
}
```

- [ ] **Step 7: E2E kont i tokenów (failing przed Step 5)**

`apps/auth/test/auth.e2e-spec.ts`:
```ts
import { createLocalJWKSet, jwtVerify } from 'jose';
import { FixedClock } from '@islanders/domain/time';
import { registerAccount, uniqueSuffix } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

const ISSUER = 'https://users.islanders.test';

describe('auth: konta i tokeny (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-13T12:00:00.000Z'));

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  it('register: 201 z uuid konta, rolą player i parą tokenów', async () => {
    const a = await registerAccount(t);
    expect(a.accountId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.roles).toEqual(['player']);
    expect(a.accessToken.split('.')).toHaveLength(3);
    expect(a.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('access token weryfikuje się przez JWKS z iss, aud i claimami gracza — tak jak zrobi to core', async () => {
    const a = await registerAccount(t);
    const jwksRes = await t.publicHttp().get('/.well-known/jwks.json').expect(200);
    expect(jwksRes.headers['cache-control']).toBe('public, max-age=300');
    const { payload, protectedHeader } = await jwtVerify(
      a.accessToken,
      createLocalJWKSet(jwksRes.body),
      { issuer: ISSUER, audience: 'islanders-worlds', currentDate: clock.now() },
    );
    expect(protectedHeader.alg).toBe('EdDSA');
    expect(payload).toMatchObject({ sub: a.accountId, roles: ['player'], nickname: a.nickname });
    expect(payload.exp! - payload.iat!).toBe(900);
    await t.internalHttp().get('/.well-known/jwks.json').expect(200);
  });

  it('waliduje ciało rejestracji', async () => {
    const send = (body: object) => t.publicHttp().post('/v1/auth/register').send(body);
    await send({ email: 'nie-email', nickname: 'ok_nick', password: 'haslo-testowe-123' }).expect(400);
    await send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'ok_nick', password: 'krotkie' }).expect(400);
    await send({ email: `a-${uniqueSuffix()}@t.pl`, nickname: 'zł y', password: 'haslo-testowe-123' }).expect(400);
    await send({
      email: `a-${uniqueSuffix()}@t.pl`,
      nickname: `n_${uniqueSuffix()}`,
      password: 'haslo-testowe-123',
      roles: ['admin'],
    }).expect(400);
  });

  it('zajęty e-mail i pseudonim (inną wielkością liter) -> 409 z field', async () => {
    const a = await registerAccount(t);
    const email = await t
      .publicHttp()
      .post('/v1/auth/register')
      .send({ email: a.email.toUpperCase(), nickname: `x_${uniqueSuffix()}`, password: 'haslo-testowe-123' })
      .expect(409);
    expect(email.body).toMatchObject({ statusCode: 409, error: 'Conflict', message: 'E-mail jest już zajęty', field: 'email' });
    const nick = await t
      .publicHttp()
      .post('/v1/auth/register')
      .send({ email: `y-${uniqueSuffix()}@t.pl`, nickname: a.nickname.toUpperCase(), password: 'haslo-testowe-123' })
      .expect(409);
    expect(nick.body).toMatchObject({ message: 'Pseudonim jest już zajęty', field: 'nickname' });
  });

  it('login: 200; złe hasło i nieistniejące konto -> 401 o tej samej treści', async () => {
    const a = await registerAccount(t);
    const ok = await t.publicHttp().post('/v1/auth/login').send({ email: a.email, password: a.password }).expect(200);
    expect(ok.body.accountId).toBe(a.accountId);
    const bad = await t.publicHttp().post('/v1/auth/login').send({ email: a.email, password: 'zle-haslo-123' }).expect(401);
    const missing = await t
      .publicHttp()
      .post('/v1/auth/login')
      .send({ email: `nikt-${uniqueSuffix()}@t.pl`, password: 'x' })
      .expect(401);
    expect(bad.body.message).toBe(missing.body.message);
  });

  it('refresh rotuje; stary token działa w oknie łaski 60 s, po nim 401', async () => {
    const a = await registerAccount(t);
    const refresh = (token: string) => t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: token });
    const first = await refresh(a.refreshToken).expect(200);
    expect(first.body.refreshToken).not.toBe(a.refreshToken);
    clock.advance(30_000);
    const inGrace = await refresh(a.refreshToken).expect(200);
    clock.advance(31_000);
    try {
      await refresh(a.refreshToken).expect(401);
      await refresh(first.body.refreshToken).expect(200);
      await refresh(inGrace.body.refreshToken).expect(200);
    } finally {
      clock.advance(-61_000);
    }
  });

  it('dwa równoległe odświeżenia tym samym tokenem kończą się 200 i jedną rotacją', async () => {
    const a = await registerAccount(t);
    const [one, two] = await Promise.all([
      t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }),
      t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }),
    ]);
    expect([one.status, two.status]).toEqual([200, 200]);
    expect(one.body.refreshToken).not.toBe(two.body.refreshToken);
  });

  it('logout unieważnia natychmiast, także stary token w oknie łaski', async () => {
    const a = await registerAccount(t);
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
    clock.advance(10_000);
    try {
      await t.publicHttp().post('/v1/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
      await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
      await t.publicHttp().post('/v1/auth/logout').send({ refreshToken: 'nie-istnieje' }).expect(204);
    } finally {
      clock.advance(-10_000);
    }
  });

  it('odpowiedzi mają dokładnie ustalone pola', async () => {
    const suffix = uniqueSuffix();
    const body = { email: `k-${suffix}@t.pl`, nickname: `k_${suffix}`, password: 'haslo-testowe-123' };
    const registered = await t.publicHttp().post('/v1/auth/register').send(body).expect(201);
    expect(Object.keys(registered.body).sort()).toEqual(
      ['accessToken', 'accountId', 'nickname', 'refreshToken', 'roles', 'serverTime'],
    );
    const refreshed = await t
      .publicHttp()
      .post('/v1/auth/refresh')
      .send({ refreshToken: registered.body.refreshToken })
      .expect(200);
    expect(Object.keys(refreshed.body).sort()).toEqual(['accessToken', 'refreshToken', 'serverTime']);
  });

  it('trasy kont nie istnieją na porcie wewnętrznym', async () => {
    await t.internalHttp().post('/v1/auth/login').send({ email: 'a@b.pl', password: 'x' }).expect(404);
  });
});
```
Run: `npm run build:packages && npm run test:e2e -w apps/auth`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Add accounts and EdDSA tokens with JWKS to the auth service"
```

---

### Task 8: Role, blokada konta, logowanie do tools, CLI kont i kluczy, rotacja kluczy

**Files:**
- Create: `apps/auth/src/accounts/accounts-admin.ts`, `apps/auth/src/accounts/tools-auth.controller.ts`
- Create: `apps/auth/src/cli/{cli-context,accounts,keys-generate}.ts`
- Create: `apps/auth/test/accounts-admin.e2e-spec.ts`, `apps/auth/test/key-rotation.e2e-spec.ts`
- Modify: `apps/auth/src/accounts/accounts.module.ts`

**Interfaces:**
- Consumes: `AccountsRepository`, `RefreshTokensRepository`, `AuthService.verifyCredentials`, `ARGON2_OPTIONS`, `TokenIssuer.tools` (Task 7).
- Produces:
  - `AccountsAdmin.changeRoles(email: string, add: Role[], remove: Role[]): Promise<Role[]>`, `.setPassword(email: string, password: string): Promise<void>`, `.disable(email: string): Promise<void>`, `.enable(email: string): Promise<void>`; `class AccountNotFoundError extends Error`; `class InvalidRoleChangeError extends Error`
  - `POST /v1/auth/tools/login` → `200 { accessToken, expiresAt }`, `403` bez roli `admin`
  - `withCliContext<T>(fn: (app: INestApplicationContext) => Promise<T>): Promise<T>`

- [ ] **Step 1: E2E administracji kont (failing)**

`apps/auth/test/accounts-admin.e2e-spec.ts`:
```ts
import { createLocalJWKSet, jwtVerify } from 'jose';
import { AccountsAdmin, AccountNotFoundError, InvalidRoleChangeError } from '../src/accounts/accounts-admin.js';
import { registerAccount } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: role, blokada i tools (e2e)', () => {
  let t: TestApp;
  let admin: AccountsAdmin;

  beforeAll(async () => {
    t = await createTestApp();
    admin = t.app.get(AccountsAdmin);
  });
  afterAll(async () => {
    await t.close();
  });

  const login = (email: string, password: string) =>
    t.publicHttp().post('/v1/auth/login').send({ email, password });

  it('nadanie i odebranie roli zmienia claimy przy następnym odświeżeniu', async () => {
    const a = await registerAccount(t);
    expect(await admin.changeRoles(a.email, ['tester'], [])).toEqual(['player', 'tester']);
    const refreshed = await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
    const jwks = (await t.publicHttp().get('/.well-known/jwks.json')).body;
    const { payload } = await jwtVerify(refreshed.body.accessToken, createLocalJWKSet(jwks), {
      audience: 'islanders-worlds',
    });
    expect(payload.roles).toEqual(['player', 'tester']);
    expect(await admin.changeRoles(a.email, [], ['tester'])).toEqual(['player']);
  });

  it('rola player jest nieusuwalna, nieznana rola i nieznane konto są odrzucane', async () => {
    const a = await registerAccount(t);
    await expect(admin.changeRoles(a.email, [], ['player'])).rejects.toBeInstanceOf(InvalidRoleChangeError);
    await expect(admin.changeRoles(a.email, ['king' as never], [])).rejects.toBeInstanceOf(InvalidRoleChangeError);
    await expect(admin.changeRoles('nikt@test.local', ['tester'], [])).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('blokada: login i refresh 401 tą samą treścią co złe hasło; odblokowanie przywraca logowanie', async () => {
    const a = await registerAccount(t);
    await admin.disable(a.email);
    const blocked = await login(a.email, a.password).expect(401);
    const wrong = await login(a.email, 'zle-haslo-123').expect(401);
    expect(blocked.body.message).toBe(wrong.body.message);
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await admin.enable(a.email);
    await login(a.email, a.password).expect(200);
    // blokada unieważniła refresh tokeny — odblokowanie ich nie przywraca
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
  });

  it('zmiana hasła: stare hasło 401, nowe 200, refresh tokeny unieważnione', async () => {
    const a = await registerAccount(t);
    await admin.setPassword(a.email, 'nowe-haslo-456');
    await login(a.email, a.password).expect(401);
    await login(a.email, 'nowe-haslo-456').expect(200);
    await t.publicHttp().post('/v1/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    await expect(admin.setPassword(a.email, 'krotkie')).rejects.toThrow(/8 znaków/);
  });

  it('tools/login: 403 bez roli admin, token aud islanders-tools ważny 1 h z nią', async () => {
    const a = await registerAccount(t);
    await t.publicHttp().post('/v1/auth/tools/login').send({ email: a.email, password: a.password }).expect(403);
    await admin.changeRoles(a.email, ['admin'], []);
    const res = await t.publicHttp().post('/v1/auth/tools/login').send({ email: a.email, password: a.password }).expect(200);
    const jwks = (await t.publicHttp().get('/.well-known/jwks.json')).body;
    const { payload } = await jwtVerify(res.body.accessToken, createLocalJWKSet(jwks), {
      audience: 'islanders-tools',
    });
    expect(payload.exp! - payload.iat!).toBe(3600);
    expect(Object.keys(res.body).sort()).toEqual(['accessToken', 'expiresAt', 'serverTime']);
    await t.publicHttp().post('/v1/auth/tools/login').send({ email: a.email, password: 'zle-haslo-123' }).expect(401);
  });
});
```
Run: `npm run test:e2e -w apps/auth -- accounts-admin`
Expected: FAIL (brak `accounts-admin.js`).

- [ ] **Step 2: `AccountsAdmin`**

`apps/auth/src/accounts/accounts-admin.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { ROLES, type Role } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, DB } from '@islanders/platform';
import type { AuthDb } from '../db/db.js';
import { AccountsRepository, type AccountRow } from './accounts.repository.js';
import { ARGON2_OPTIONS } from './auth.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

export class AccountNotFoundError extends Error {
  constructor(email: string) {
    super(`Nie ma konta ${email}`);
    this.name = 'AccountNotFoundError';
  }
}

export class InvalidRoleChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoleChangeError';
  }
}

export class InvalidPasswordError extends Error {
  constructor() {
    super('Hasło musi mieć od 8 do 128 znaków');
    this.name = 'InvalidPasswordError';
  }
}

/** Operacje technika wywoływane z CLI. Bez tras HTTP — role nadaje się poza aplikacją. */
@Injectable()
export class AccountsAdmin {
  constructor(
    private readonly accounts: AccountsRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    @Inject(DB) private readonly db: AuthDb,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async changeRoles(email: string, add: Role[], remove: Role[]): Promise<Role[]> {
    for (const role of [...add, ...remove]) {
      if (!(ROLES as readonly string[]).includes(role)) {
        throw new InvalidRoleChangeError(`Nieznana rola ${role}`);
      }
    }
    if (remove.includes('player')) {
      throw new InvalidRoleChangeError('Roli player nie można odebrać');
    }
    const account = await this.require(email);
    const next = ROLES.filter(
      (r) => (account.roles.includes(r) || add.includes(r)) && !remove.includes(r),
    );
    await this.accounts.setRoles(account.id, next);
    return next;
  }

  async setPassword(email: string, password: string): Promise<void> {
    if (password.length < 8 || password.length > 128) {
      throw new InvalidPasswordError();
    }
    const account = await this.require(email);
    const hash = await argon2.hash(password, ARGON2_OPTIONS);
    await this.db.transaction(async (tx) => {
      await this.accounts.setPasswordHash(tx, account.id, hash);
      await this.refreshTokens.revokeAllForAccount(tx, account.id, this.clock.now());
    });
  }

  async disable(email: string): Promise<void> {
    const account = await this.require(email);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await this.accounts.setDisabledAt(tx, account.id, now);
      await this.refreshTokens.revokeAllForAccount(tx, account.id, now);
    });
  }

  async enable(email: string): Promise<void> {
    const account = await this.require(email);
    await this.accounts.setDisabledAt(this.db, account.id, null);
  }

  private async require(email: string): Promise<AccountRow> {
    const account = await this.accounts.findByEmail(email);
    if (!account) throw new AccountNotFoundError(email);
    return account;
  }
}
```

- [ ] **Step 3: Logowanie do tools**

`apps/auth/src/accounts/tools-auth.controller.ts`:
```ts
import { Body, Controller, ForbiddenException, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiForbiddenResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RateLimit, RateLimitGuard } from '@islanders/platform';
import { TokenIssuer } from '../tokens/token-issuer.js';
import { LoginDto, ToolsTokenDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('v1/auth/tools')
@UseGuards(RateLimitGuard)
@RateLimit('ip')
export class ToolsAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly issuer: TokenIssuer,
  ) {}

  /** Token panelu admina: bez refresh tokenu, po godzinie logowanie od nowa. */
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: ToolsTokenDto })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  async login(@Body() dto: LoginDto): Promise<ToolsTokenDto> {
    const account = await this.auth.verifyCredentials(dto);
    if (!account.roles.includes('admin')) {
      throw new ForbiddenException('Wymagana rola admin');
    }
    const { token, expiresAt } = await this.issuer.tools(account);
    return { accessToken: token, expiresAt: expiresAt.toISOString() };
  }
}
```
`apps/auth/src/accounts/accounts.module.ts` — `controllers: [AuthController, ToolsAuthController]`, `providers` i `exports` z dopisanym `AccountsAdmin`.

Run: `npm run test:e2e -w apps/auth -- accounts-admin`
Expected: PASS.

- [ ] **Step 4: E2E rotacji kluczy (failing → passing bez zmian w kodzie)**

Test dowodzi procedury ze specu §4.2 na trzech konfiguracjach tej samej bazy.

`apps/auth/test/key-rotation.e2e-spec.ts`:
```ts
import { createLocalJWKSet, jwtVerify } from 'jose';
import { registerAccount } from './support/fixtures.js';
import { keysEnv, testSigningKeys } from './support/keys.js';
import { createTestApp } from './support/test-app.js';

describe('auth: rotacja kluczy podpisu (e2e)', () => {
  it('token starego klucza przechodzi, dopóki klucz jest retiring, a po usunięciu — nie', async () => {
    const { active: k1, other: k2 } = testSigningKeys;

    const before = await createTestApp({ env: { JWT_SIGNING_KEYS: keysEnv(k1) } });
    const account = await registerAccount(before);
    await before.close();

    const during = await createTestApp({
      env: { JWT_SIGNING_KEYS: keysEnv({ ...k2, status: 'active' }, { ...k1, status: 'retiring' }) },
    });
    try {
      const jwks = (await during.publicHttp().get('/.well-known/jwks.json').expect(200)).body;
      expect(jwks.keys.map((k: { kid: string }) => k.kid).sort()).toEqual([k1.kid, k2.kid].sort());
      await expect(
        jwtVerify(account.accessToken, createLocalJWKSet(jwks), { audience: 'islanders-worlds' }),
      ).resolves.toBeDefined();
      const fresh = await during
        .publicHttp()
        .post('/v1/auth/login')
        .send({ email: account.email, password: account.password })
        .expect(200);
      const header = JSON.parse(Buffer.from(fresh.body.accessToken.split('.')[0], 'base64url').toString());
      expect(header.kid).toBe(k2.kid);
    } finally {
      await during.close();
    }

    const after = await createTestApp({ env: { JWT_SIGNING_KEYS: keysEnv({ ...k2, status: 'active' }) } });
    try {
      const jwks = (await after.publicHttp().get('/.well-known/jwks.json').expect(200)).body;
      await expect(
        jwtVerify(account.accessToken, createLocalJWKSet(jwks), { audience: 'islanders-worlds' }),
      ).rejects.toThrow();
    } finally {
      await after.close();
    }
  });
});
```
Run: `npm run test:e2e -w apps/auth -- key-rotation`
Expected: PASS.

- [ ] **Step 5: CLI**

`apps/auth/src/cli/cli-context.ts`:
```ts
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
```
`apps/auth/src/cli/accounts.ts`:
```ts
import { parseArgs } from 'node:util';
import type { Role } from '@islanders/contracts';
import { AccountsAdmin } from '../accounts/accounts-admin.js';
import { withCliContext } from './cli-context.js';

const USAGE = `Użycie:
  npm run account:roles -w apps/auth -- --email <e> [--add <rola>]... [--remove <rola>]...
  npm run account:set-password -w apps/auth -- --email <e>     (hasło ze stdin)
  npm run account:disable -w apps/auth -- --email <e>
  npm run account:enable -w apps/auth -- --email <e>`;

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    email: { type: 'string' },
    add: { type: 'string', multiple: true, default: [] },
    remove: { type: 'string', multiple: true, default: [] },
  },
});

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

if (!values.email || !['roles', 'set-password', 'disable', 'enable'].includes(command ?? '')) {
  console.error(USAGE);
  process.exit(2);
}
const email = values.email;

try {
  await withCliContext(async (app) => {
    const admin = app.get(AccountsAdmin);
    switch (command) {
      case 'roles':
        console.log(`Role: ${(await admin.changeRoles(email, values.add as Role[], values.remove as Role[])).join(', ')}`);
        break;
      case 'set-password':
        await admin.setPassword(email, await readStdin());
        console.log('Hasło zmienione, sesje unieważnione.');
        break;
      case 'disable':
        await admin.disable(email);
        console.log('Konto zablokowane, sesje unieważnione.');
        break;
      case 'enable':
        await admin.enable(email);
        console.log('Konto odblokowane.');
        break;
    }
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```
`apps/auth/src/cli/keys-generate.ts`:
```ts
import { generateSigningKeyEntry } from '../keys/generate-signing-key.js';

const entry = await generateSigningKeyEntry();
console.log(
  [
    'Nowy wpis do JWT_SIGNING_KEYS (klucz prywatny — traktuj jak sekret).',
    'Rotacja: dodaj go jako "active", poprzedni aktywny oznacz "retiring",',
    'a usuń go najwcześniej po JWT_ACCESS_TTL + 5 minut cache JWKS.',
    '',
    JSON.stringify(entry),
  ].join('\n'),
);
```

- [ ] **Step 6: Sprawdzenie CLI na żywo**

```bash
npm run compose:up
npm run build -w apps/auth
cd apps/auth
node dist/cli/keys-generate.js | tail -1
```
Expected: jedna linia JSON z `"status":"active"` i `"crv":"Ed25519"`. Pozostałe komendy wymagają bazy `islanders_auth` — sprawdzane w Task 12.
```bash
cd ../..
```

- [ ] **Step 7: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Add roles, account blocking, tools login and account and key CLI to the auth service"
```

---

### Task 9: Klienci serwisowi, rejestr światów i lista światów

**Files:**
- Create: `apps/auth/src/common/zod.pipe.ts`
- Create: `apps/auth/src/tokens/guards.ts`
- Create: `apps/auth/src/service-clients/{service-clients,generate-service-client,internal-token.controller,service-clients.module}.ts`, `apps/auth/src/service-clients/service-clients.spec.ts`
- Create: `apps/auth/src/worlds/{worlds.repository,worlds.controller,internal-worlds.controller,worlds.module}.ts`
- Create: `apps/auth/src/cli/client-create.ts`
- Create: `apps/auth/test/support/service-clients.ts`, `apps/auth/test/worlds.e2e-spec.ts`
- Modify: `apps/auth/src/tokens/tokens.module.ts`, `apps/auth/src/app.module.ts`, `apps/auth/test/support/test-app.ts`, `apps/auth/test/support/fixtures.ts`

**Interfaces:**
- Consumes: `TokenIssuer.service`, `TokenVerifier.verify` (Task 7), `worldRegistrationSchema`, `worldSlugSchema`, `slugFromServiceSubject`, `WorldListItem`, `Role` (Task 5).
- Produces:
  - `ZodPipe(schema)` — `PipeTransform`, 400 z listą błędów
  - `AccessTokenGuard` (ustawia `req.account: { id: string; roles: Role[] }` i `req.rateLimitSubject`), `ServiceTokenGuard` (ustawia `req.serviceWorldSlug: string`), dekoratory `CurrentAccount()`, `CurrentServiceWorld()`
  - `serviceClientEntrySchema`, `type ServiceClientEntry = { clientId: string; secretSha256: string; worldSlug: string }`, `parseServiceClients(entries: unknown[]): ServiceClientEntry[]`, `SERVICE_CLIENTS: symbol`, `ServiceClients.authenticate(clientId: string, secret: string): ServiceClientEntry | null`
  - `generateServiceClient(worldSlug: string): { clientId: string; secret: string; entry: ServiceClientEntry }`
  - `WorldsRepository.upsert(slug: string, registration: WorldRegistration, now: Date): Promise<void>`, `.find(slug): Promise<WorldRow | undefined>`, `.listVisible(accountId: string, includeTest: boolean): Promise<WorldListItem[]>`, `.setStatus(client, slug, status, now)`, `.listAll(): Promise<WorldRow[]>`, `.setReachable(slug, reachable, now)`; `type WorldRow`
  - test: `testServiceClients: { world1: { clientId; secret }, world2: { clientId; secret } }`, `serviceClientsEnv(): string`, `serviceToken(t, client): Promise<string>`, `registerWorld(t, slug, overrides?)`

- [ ] **Step 1: Test klientów serwisowych (failing)**

`apps/auth/src/service-clients/service-clients.spec.ts`:
```ts
import { generateServiceClient } from './generate-service-client.js';
import { ServiceClients, parseServiceClients } from './service-clients.js';

describe('klienci serwisowi', () => {
  it('wygenerowany klient uwierzytelnia się swoim sekretem i tylko nim', () => {
    const one = generateServiceClient('world-1');
    const two = generateServiceClient('world-2');
    const clients = new ServiceClients(parseServiceClients([one.entry, two.entry]));
    expect(clients.authenticate(one.clientId, one.secret)?.worldSlug).toBe('world-1');
    expect(clients.authenticate(one.clientId, two.secret)).toBeNull();
    expect(clients.authenticate('nieznany', one.secret)).toBeNull();
    expect(one.secret.length).toBeGreaterThanOrEqual(43);
    expect(one.entry.secretSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('odrzuca powtórzony clientId, zły slug i zły skrót', () => {
    const one = generateServiceClient('world-1');
    expect(() => parseServiceClients([one.entry, one.entry])).toThrow(/clientId/);
    expect(() => parseServiceClients([{ ...one.entry, worldSlug: 'World 1' }])).toThrow();
    expect(() => parseServiceClients([{ ...one.entry, secretSha256: 'abc' }])).toThrow();
  });
});
```
Run: `npm run test -w apps/auth -- service-clients`
Expected: FAIL.

- [ ] **Step 2: Implementacja klientów serwisowych**

`apps/auth/src/service-clients/service-clients.ts`:
```ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { worldSlugSchema } from '@islanders/contracts';

export const SERVICE_CLIENTS = Symbol('SERVICE_CLIENTS');

export const serviceClientEntrySchema = z.object({
  clientId: z.string().min(3).max(64),
  secretSha256: z.string().regex(/^[0-9a-f]{64}$/),
  worldSlug: worldSlugSchema,
});
export type ServiceClientEntry = z.infer<typeof serviceClientEntrySchema>;

export function parseServiceClients(entries: unknown[]): ServiceClientEntry[] {
  const parsed = z.array(serviceClientEntrySchema).parse(entries);
  if (new Set(parsed.map((e) => e.clientId)).size !== parsed.length) {
    throw new Error('SERVICE_CLIENTS: powtórzony clientId');
  }
  return parsed;
}

function sha256(text: string): Buffer {
  return createHash('sha256').update(text).digest();
}

/** Skrót, z którym porównujemy sekret nieznanego klienta, żeby czas odpowiedzi był ten sam. */
const DUMMY_HASH = sha256('atrapa-klienta-serwisowego');

/**
 * Sekret ma co najmniej 32 losowe bajty, więc SHA-256 wystarcza — argon2 chroni hasła
 * o niskiej entropii, a tu entropii jest pod dostatkiem.
 */
export class ServiceClients {
  private readonly byId: Map<string, ServiceClientEntry>;

  constructor(entries: ServiceClientEntry[]) {
    this.byId = new Map(entries.map((e) => [e.clientId, e]));
  }

  authenticate(clientId: string, secret: string): ServiceClientEntry | null {
    const entry = this.byId.get(clientId);
    const expected = entry ? Buffer.from(entry.secretSha256, 'hex') : DUMMY_HASH;
    const matches = timingSafeEqual(sha256(secret), expected);
    return entry && matches ? entry : null;
  }
}
```
`apps/auth/src/service-clients/generate-service-client.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';
import { worldSlugSchema } from '@islanders/contracts';
import type { ServiceClientEntry } from './service-clients.js';

export function generateServiceClient(worldSlug: string): {
  clientId: string;
  secret: string;
  entry: ServiceClientEntry;
} {
  const slug = worldSlugSchema.parse(worldSlug);
  const clientId = `core-${slug}`;
  const secret = randomBytes(32).toString('base64url');
  const secretSha256 = createHash('sha256').update(secret).digest('hex');
  return { clientId, secret, entry: { clientId, secretSha256, worldSlug: slug } };
}
```
Run: `npm run test -w apps/auth -- service-clients`
Expected: PASS.

- [ ] **Step 3: Pipe zod i strażnicy tokenów**

`apps/auth/src/common/zod.pipe.ts`:
```ts
import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Ciała tras wewnętrznych walidujemy schematami z @islanders/contracts, nie DTO class-validator. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      });
    }
    return result.data;
  }
}
```
Uwaga: globalny `ValidationPipe` z `whitelist` działa tylko na klasach DTO; parametr typu `unknown` przechodzi przez niego bez zmian, więc `ZodPipe` dostaje surowe ciało.

`apps/auth/src/tokens/guards.ts`:
```ts
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { slugFromServiceSubject, type Role } from '@islanders/contracts';
import { TokenVerifier } from './token-verifier.js';

export interface AccountPrincipal {
  id: string;
  roles: Role[];
}

interface AuthRequest {
  headers: { authorization?: string };
  account?: AccountPrincipal;
  serviceWorldSlug?: string;
  rateLimitSubject?: string;
}

function bearerToken(req: AuthRequest): string {
  // RFC 7235: schemat uwierzytelnienia jest nieczuły na wielkość znaków.
  const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
  if (!token) throw new UnauthorizedException('Brak tokenu');
  return token;
}

/** Token gracza (`aud: islanders-worlds`). Stawiać PRZED RateLimitGuard w `@UseGuards`. */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const claims = await this.verifier.verify(bearerToken(req), 'worlds');
    req.account = { id: claims.sub, roles: claims.roles };
    req.rateLimitSubject = `account:${claims.sub}`;
    return true;
  }
}

/** Token serwisowy świata (`aud: islanders-internal`). */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const claims = await this.verifier.verify(bearerToken(req), 'internal');
    req.serviceWorldSlug = slugFromServiceSubject(claims.sub);
    return true;
  }
}

export const CurrentAccount = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AccountPrincipal =>
    ctx.switchToHttp().getRequest<AuthRequest>().account!,
);

export const CurrentServiceWorld = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<AuthRequest>().serviceWorldSlug!,
);
```
W `apps/auth/src/tokens/tokens.module.ts` dopisz `AccessTokenGuard`, `ServiceTokenGuard` do `providers` i `exports`.

- [ ] **Step 4: Moduł klientów i endpoint tokenu**

`apps/auth/src/service-clients/internal-token.controller.ts`:
```ts
import { Body, Controller, HttpCode, Inject, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RateLimit, RateLimitGuard } from '@islanders/platform';
import { ZodPipe } from '../common/zod.pipe.js';
import { TokenIssuer } from '../tokens/token-issuer.js';
import { SERVICE_CLIENTS, type ServiceClients } from './service-clients.js';

const credentialsSchema = z.strictObject({
  clientId: z.string().min(1).max(64),
  clientSecret: z.string().min(1).max(256),
});

@ApiTags('internal')
@Controller('internal/v1')
export class InternalTokenController {
  constructor(
    @Inject(SERVICE_CLIENTS) private readonly clients: ServiceClients,
    private readonly issuer: TokenIssuer,
  ) {}

  @Post('token')
  @HttpCode(200)
  @UseGuards(RateLimitGuard)
  @RateLimit('ip')
  async token(
    @Body(new ZodPipe(credentialsSchema)) body: z.output<typeof credentialsSchema>,
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const client = this.clients.authenticate(body.clientId, body.clientSecret);
    if (!client) {
      throw new UnauthorizedException('Błędne dane klienta');
    }
    const { token, expiresAt } = await this.issuer.service(client.worldSlug);
    return { accessToken: token, expiresAt: expiresAt.toISOString() };
  }
}
```
`apps/auth/src/service-clients/service-clients.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { InternalTokenController } from './internal-token.controller.js';
import { SERVICE_CLIENTS, ServiceClients, parseServiceClients } from './service-clients.js';

@Module({
  controllers: [InternalTokenController],
  providers: [
    {
      provide: SERVICE_CLIENTS,
      inject: [ENV],
      useFactory: (env: AuthEnv) => new ServiceClients(parseServiceClients(env.SERVICE_CLIENTS)),
    },
  ],
})
export class ServiceClientsModule {}
```

- [ ] **Step 5: Rejestr światów**

`apps/auth/src/worlds/worlds.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';
import type { WorldListItem, WorldRegistration, WorldStatus } from '@islanders/contracts';
import { DB, type AuthDb, type AuthDbClient } from '../db/db.js';
import { worldMemberships, worlds } from '../db/schema/index.js';

export type WorldRow = typeof worlds.$inferSelect;

@Injectable()
export class WorldsRepository {
  constructor(@Inject(DB) private readonly db: AuthDb) {}

  /** Zgłoszenie świata nie zmienia `reachable` — to pole należy do sondy. */
  async upsert(slug: string, r: WorldRegistration, now: Date): Promise<void> {
    await this.db
      .insert(worlds)
      .values({ slug, ...r, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: worlds.slug,
        set: {
          name: r.name,
          publicUrl: r.publicUrl,
          adminUrl: r.adminUrl,
          status: r.status,
          isTest: r.isTest,
          updatedAt: now,
        },
      });
  }

  async find(slug: string, client: AuthDbClient = this.db): Promise<WorldRow | undefined> {
    const [row] = await client.select().from(worlds).where(eq(worlds.slug, slug));
    return row;
  }

  listAll(): Promise<WorldRow[]> {
    return this.db.select().from(worlds).orderBy(asc(worlds.slug));
  }

  async listVisible(accountId: string, includeTest: boolean): Promise<WorldListItem[]> {
    const rows = await this.db
      .select({
        slug: worlds.slug,
        name: worlds.name,
        publicUrl: worlds.publicUrl,
        status: worlds.status,
        isTest: worlds.isTest,
        reachable: worlds.reachable,
        joined: sql<boolean>`${worldMemberships.accountId} IS NOT NULL`,
      })
      .from(worlds)
      .leftJoin(
        worldMemberships,
        and(
          eq(worldMemberships.worldSlug, worlds.slug),
          eq(worldMemberships.accountId, accountId),
          isNull(worldMemberships.leftAt),
        ),
      )
      .where(and(ne(worlds.status, 'DRAFT'), includeTest ? undefined : eq(worlds.isTest, false)))
      .orderBy(asc(worlds.slug));
    return rows as WorldListItem[];
  }

  async setStatus(client: AuthDbClient, slug: string, status: WorldStatus, now: Date): Promise<void> {
    await client.update(worlds).set({ status, updatedAt: now }).where(eq(worlds.slug, slug));
  }

  async setReachable(slug: string, reachable: boolean, now: Date): Promise<void> {
    await this.db.update(worlds).set({ reachable, lastProbeAt: now }).where(eq(worlds.slug, slug));
  }
}
```
`apps/auth/src/worlds/worlds.controller.ts`:
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { WorldListItem } from '@islanders/contracts';
import { RateLimitGuard } from '@islanders/platform';
import { AccessTokenGuard, CurrentAccount, type AccountPrincipal } from '../tokens/guards.js';
import { WorldsRepository } from './worlds.repository.js';

@ApiTags('worlds')
@ApiBearerAuth()
@Controller('v1/worlds')
@UseGuards(AccessTokenGuard, RateLimitGuard)
export class WorldsController {
  constructor(private readonly worlds: WorldsRepository) {}

  /** Bez `DRAFT`; świat testowy tylko dla ról tester i admin. */
  @Get()
  list(@CurrentAccount() account: AccountPrincipal): Promise<WorldListItem[]> {
    const includeTest = account.roles.includes('tester') || account.roles.includes('admin');
    return this.worlds.listVisible(account.id, includeTest);
  }
}
```
`apps/auth/src/worlds/internal-worlds.controller.ts`:
```ts
import { Body, Controller, ForbiddenException, HttpCode, Inject, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { worldRegistrationSchema, type WorldRegistration } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK } from '@islanders/platform';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentServiceWorld, ServiceTokenGuard } from '../tokens/guards.js';
import { WorldsRepository } from './worlds.repository.js';

@ApiTags('internal')
@Controller('internal/v1/worlds')
@UseGuards(ServiceTokenGuard)
export class InternalWorldsController {
  constructor(
    private readonly worlds: WorldsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Świat może zgłosić wyłącznie siebie. */
  @Put(':slug')
  @HttpCode(204)
  async register(
    @Param('slug') slug: string,
    @CurrentServiceWorld() serviceWorld: string,
    @Body(new ZodPipe(worldRegistrationSchema)) body: WorldRegistration,
  ): Promise<void> {
    if (slug !== serviceWorld) {
      throw new ForbiddenException('Klient może zgłaszać wyłącznie własny świat');
    }
    await this.worlds.upsert(slug, body, this.clock.now());
  }
}
```
`apps/auth/src/worlds/worlds.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { InternalWorldsController } from './internal-worlds.controller.js';
import { WorldsController } from './worlds.controller.js';
import { WorldsRepository } from './worlds.repository.js';

@Module({
  controllers: [WorldsController, InternalWorldsController],
  providers: [WorldsRepository],
  exports: [WorldsRepository],
})
export class WorldsModule {}
```
W `apps/auth/src/app.module.ts` dopisz do `imports`: `ServiceClientsModule`, `WorldsModule`.

- [ ] **Step 6: CLI `client:create`**

`apps/auth/src/cli/client-create.ts`:
```ts
import { parseArgs } from 'node:util';
import { generateServiceClient } from '../service-clients/generate-service-client.js';

const { values } = parseArgs({ options: { world: { type: 'string' } } });
if (!values.world) {
  console.error('Użycie: npm run client:create -w apps/auth -- --world <slug>');
  process.exit(2);
}
try {
  const { clientId, secret, entry } = generateServiceClient(values.world);
  console.log(
    [
      `Core świata ${entry.worldSlug}: AUTH_CLIENT_ID=${clientId}`,
      `Core świata ${entry.worldSlug}: AUTH_CLIENT_SECRET=${secret}   (wyświetlany tylko teraz)`,
      '',
      'Wpis do SERVICE_CLIENTS w auth:',
      JSON.stringify(entry),
    ].join('\n'),
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
```

- [ ] **Step 7: Wsparcie testów**

`apps/auth/test/support/service-clients.ts`:
```ts
import { createHash } from 'node:crypto';

function client(worldSlug: string) {
  const clientId = `core-${worldSlug}`;
  const secret = `sekret-testowy-${worldSlug}-0123456789abcdefghij`;
  return {
    clientId,
    secret,
    entry: { clientId, secretSha256: createHash('sha256').update(secret).digest('hex'), worldSlug },
  };
}

export const testServiceClients = {
  world1: client('world-1'),
  world2: client('world-2'),
  world2Test: client('world-2-test'),
};

export function serviceClientsEnv(): string {
  return JSON.stringify(Object.values(testServiceClients).map((c) => c.entry));
}
```
W `apps/auth/test/support/test-app.ts`: import `import { serviceClientsEnv } from './service-clients.js';` i zamień `SERVICE_CLIENTS: '[]'` na `SERVICE_CLIENTS: serviceClientsEnv()`.

Dopisz do `apps/auth/test/support/fixtures.ts`:
```ts
import type { WorldRegistration } from '@islanders/contracts';
import { testServiceClients } from './service-clients.js';

type TestClient = (typeof testServiceClients)[keyof typeof testServiceClients];

export async function serviceToken(t: TestApp, client: TestClient): Promise<string> {
  const res = await t
    .internalHttp()
    .post('/internal/v1/token')
    .send({ clientId: client.clientId, clientSecret: client.secret })
    .expect(200);
  return res.body.accessToken;
}

export async function registerWorld(
  t: TestApp,
  client: TestClient,
  overrides: Partial<WorldRegistration> = {},
): Promise<void> {
  const slug = client.entry.worldSlug;
  await t
    .internalHttp()
    .put(`/internal/v1/worlds/${slug}`)
    .set('Authorization', bearer(await serviceToken(t, client)))
    .send({
      name: `Świat ${slug}`,
      publicUrl: `https://${slug}.islanders.test`,
      adminUrl: `http://${slug}:3001`,
      status: 'OPEN',
      isTest: slug.endsWith('-test'),
      ...overrides,
    })
    .expect(204);
}
```
(importy dopisz na górze pliku, obok istniejących)

- [ ] **Step 8: E2E rejestru i listy (failing przed Step 5)**

`apps/auth/test/worlds.e2e-spec.ts`:
```ts
import { AccountsAdmin } from '../src/accounts/accounts-admin.js';
import { bearer, registerAccount, registerWorld, serviceToken } from './support/fixtures.js';
import { testServiceClients } from './support/service-clients.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: klienci serwisowi i rejestr światów (e2e)', () => {
  let t: TestApp;
  const { world1, world2, world2Test } = testServiceClients;

  beforeAll(async () => {
    t = await createTestApp();
    await registerWorld(t, world1);
    await registerWorld(t, world2, { status: 'DRAFT' });
    await registerWorld(t, world2Test);
  });
  afterAll(async () => {
    await t.close();
  });

  const listAs = (token: string) =>
    t.publicHttp().get('/v1/worlds').set('Authorization', bearer(token)).expect(200);

  it('client credentials: zły sekret 401, nieznany klient 401, trasa niedostępna publicznie', async () => {
    await t
      .internalHttp()
      .post('/internal/v1/token')
      .send({ clientId: world1.clientId, clientSecret: world2.secret })
      .expect(401);
    await t.internalHttp().post('/internal/v1/token').send({ clientId: 'nikt', clientSecret: 'x' }).expect(401);
    await t
      .publicHttp()
      .post('/internal/v1/token')
      .send({ clientId: world1.clientId, clientSecret: world1.secret })
      .expect(404);
  });

  it('świat nie może zgłosić cudzego sluga', async () => {
    await t
      .internalHttp()
      .put('/internal/v1/worlds/world-2')
      .set('Authorization', bearer(await serviceToken(t, world1)))
      .send({
        name: 'Podszyty',
        publicUrl: 'https://evil.test',
        adminUrl: 'http://evil:3001',
        status: 'OPEN',
        isTest: false,
      })
      .expect(403);
  });

  it('rejestr odrzuca token gracza i ciało niezgodne z kontraktem', async () => {
    const a = await registerAccount(t);
    await t
      .internalHttp()
      .put('/internal/v1/worlds/world-1')
      .set('Authorization', bearer(a.accessToken))
      .send({})
      .expect(401);
    await t
      .internalHttp()
      .put('/internal/v1/worlds/world-1')
      .set('Authorization', bearer(await serviceToken(t, world1)))
      .send({ name: 'x', publicUrl: 'nie-url', adminUrl: 'http://a:1', status: 'OPEN', isTest: false })
      .expect(400);
  });

  it('gracz widzi otwarte światy bez DRAFT i bez testowych; tester widzi testowy', async () => {
    const player = await registerAccount(t);
    const asPlayer = await listAs(player.accessToken);
    expect(asPlayer.body.map((w: { slug: string }) => w.slug)).toEqual(['world-1']);
    // `reachable` należy do sondy i zależy od innych plików e2e na tej samej bazie — tu tylko typ.
    expect(Object.keys(asPlayer.body[0]).sort()).toEqual(
      ['isTest', 'joined', 'name', 'publicUrl', 'reachable', 'slug', 'status'],
    );
    expect(asPlayer.body[0]).toMatchObject({
      slug: 'world-1',
      name: 'Świat world-1',
      publicUrl: 'https://world-1.islanders.test',
      status: 'OPEN',
      isTest: false,
      joined: false,
    });
    expect(typeof asPlayer.body[0].reachable).toBe('boolean');

    const tester = await registerAccount(t);
    await t.app.get(AccountsAdmin).changeRoles(tester.email, ['tester'], []);
    const login = await t
      .publicHttp()
      .post('/v1/auth/login')
      .send({ email: tester.email, password: tester.password })
      .expect(200);
    const asTester = await listAs(login.body.accessToken);
    expect(asTester.body.map((w: { slug: string }) => w.slug)).toEqual(['world-1', 'world-2-test']);
  });

  it('ponowne zgłoszenie aktualizuje wpis', async () => {
    await registerWorld(t, world1, { name: 'Świat pierwszy', status: 'CLOSED' });
    const player = await registerAccount(t);
    const res = await listAs(player.accessToken);
    expect(res.body[0]).toMatchObject({ slug: 'world-1', name: 'Świat pierwszy', status: 'CLOSED' });
    await registerWorld(t, world1);
  });

  it('lista wymaga tokenu gracza; token serwisowy jest odrzucany', async () => {
    await t.publicHttp().get('/v1/worlds').expect(401);
    await t
      .publicHttp()
      .get('/v1/worlds')
      .set('Authorization', bearer(await serviceToken(t, world1)))
      .expect(401);
  });
});
```
Run: `npm run test:e2e -w apps/auth -- worlds`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Add service client credentials, the world registry and the world list to the auth service"
```

---

### Task 10: Zdarzenia od światów

**Files:**
- Create: `apps/auth/src/events/{events.service,internal-events.controller,events.module}.ts`
- Create: `apps/auth/test/events.e2e-spec.ts`
- Modify: `apps/auth/src/app.module.ts`

**Interfaces:**
- Consumes: `ServiceTokenGuard`, `CurrentServiceWorld`, `ZodPipe`, `WorldsRepository.find|setStatus` (Task 9); `eventBatchSchema`, `WorldEvent` (Task 5); tabele `processedEvents`, `worldMemberships`.
- Produces: `EventsService.ingest(serviceWorld: string, events: WorldEvent[]): Promise<{ accepted: number; duplicates: number }>`; `POST /internal/v1/events` → `200 { accepted, duplicates }`, `403` gdy zdarzenie cudzego świata, `409` gdy świat spoza rejestru.

- [ ] **Step 1: E2E zdarzeń (failing)**

`apps/auth/test/events.e2e-spec.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { bearer, registerAccount, registerWorld, serviceToken } from './support/fixtures.js';
import { testServiceClients } from './support/service-clients.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: zdarzenia od światów (e2e)', () => {
  let t: TestApp;
  const { world1, world2 } = testServiceClients;

  beforeAll(async () => {
    t = await createTestApp();
    await registerWorld(t, world1);
  });
  afterAll(async () => {
    await t.close();
  });

  const at = '2026-09-13T12:00:00.000Z';
  const joined = (accountId: string, slug = 'world-1') => ({
    type: 'PlayerJoinedWorld',
    eventId: randomUUID(),
    worldSlug: slug,
    occurredAt: at,
    accountId,
    joinedAt: at,
  });
  const left = (accountId: string) => ({
    type: 'PlayerLeftWorld',
    eventId: randomUUID(),
    worldSlug: 'world-1',
    occurredAt: at,
    accountId,
    leftAt: '2026-09-13T13:00:00.000Z',
  });
  const send = async (client: typeof world1, events: object[]) =>
    t
      .internalHttp()
      .post('/internal/v1/events')
      .set('Authorization', bearer(await serviceToken(t, client)))
      .send({ events });
  const joinedFlag = async (token: string) => {
    const res = await t.publicHttp().get('/v1/worlds').set('Authorization', bearer(token)).expect(200);
    return res.body.find((w: { slug: string }) => w.slug === 'world-1').joined;
  };

  it('PlayerJoinedWorld ustawia joined; PlayerLeftWorld je zdejmuje', async () => {
    const a = await registerAccount(t);
    expect(await joinedFlag(a.accessToken)).toBe(false);
    expect((await send(world1, [joined(a.accountId)])).body).toMatchObject({ accepted: 1, duplicates: 0 });
    expect(await joinedFlag(a.accessToken)).toBe(true);
    await send(world1, [left(a.accountId)]).then((r) => expect(r.status).toBe(200));
    expect(await joinedFlag(a.accessToken)).toBe(false);
  });

  it('ta sama partia wysłana dwa razy zmienia stan raz', async () => {
    const a = await registerAccount(t);
    const batch = [joined(a.accountId), left(a.accountId)];
    expect((await send(world1, batch)).body).toMatchObject({ accepted: 2, duplicates: 0 });
    // Ponowne dołączenie nowym zdarzeniem, potem powtórka starej partii: stare „left” nie może go cofnąć.
    await send(world1, [joined(a.accountId)]);
    expect((await send(world1, batch)).body).toMatchObject({ accepted: 0, duplicates: 2 });
    expect(await joinedFlag(a.accessToken)).toBe(true);
  });

  it('WorldStatusChanged zmienia status w rejestrze', async () => {
    const player = await registerAccount(t);
    await send(world1, [
      { type: 'WorldStatusChanged', eventId: randomUUID(), worldSlug: 'world-1', occurredAt: at, status: 'CLOSED' },
    ]).then((r) => expect(r.status).toBe(200));
    const res = await t.publicHttp().get('/v1/worlds').set('Authorization', bearer(player.accessToken)).expect(200);
    expect(res.body.find((w: { slug: string }) => w.slug === 'world-1').status).toBe('CLOSED');
    await registerWorld(t, world1);
  });

  it('zdarzenie cudzego świata odrzuca całą partię (403), świat spoza rejestru daje 409', async () => {
    const a = await registerAccount(t);
    expect((await send(world1, [joined(a.accountId), joined(a.accountId, 'world-2')])).status).toBe(403);
    expect(await joinedFlag(a.accessToken)).toBe(false);
    expect((await send(world2, [joined(a.accountId, 'world-2')])).status).toBe(409);
  });

  it('nieznane konto: zdarzenie przyjęte jako przetworzone i pominięte, żeby nie blokować outboxa', async () => {
    const res = await send(world1, [joined(randomUUID())]);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ accepted: 1, duplicates: 0 });
  });

  it('partia niezgodna z kontraktem -> 400', async () => {
    expect((await send(world1, [])).status).toBe(400);
  });
});
```
Run: `npm run test:e2e -w apps/auth -- events`
Expected: FAIL (404).

- [ ] **Step 2: Implementacja**

`apps/auth/src/events/events.service.ts`:
```ts
import { ConflictException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, lte } from 'drizzle-orm';
import type { WorldEvent } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, DB, isForeignKeyViolation } from '@islanders/platform';
import type { AuthDb, AuthDbClient } from '../db/db.js';
import { processedEvents, worldMemberships } from '../db/schema/index.js';
import { WorldsRepository } from '../worlds/worlds.repository.js';

/** Punkt zapisu wewnątrz transakcji zdarzenia — błąd klucza obcego cofa tylko zastosowanie, nie wpis o przetworzeniu. */
class UnknownAccount extends Error {}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly worlds: WorldsRepository,
    @Inject(DB) private readonly db: AuthDb,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Co najmniej raz, w kolejności nadania. Każde zdarzenie w osobnej transakcji razem z wpisem
   * w `processed_events`, więc powtórzona partia pomija już zastosowane zdarzenia.
   */
  async ingest(serviceWorld: string, events: WorldEvent[]): Promise<{ accepted: number; duplicates: number }> {
    if (events.some((e) => e.worldSlug !== serviceWorld)) {
      throw new ForbiddenException('Partia zawiera zdarzenia innego świata');
    }
    if (!(await this.worlds.find(serviceWorld))) {
      throw new ConflictException('Świat nie jest zgłoszony w rejestrze');
    }
    let accepted = 0;
    let duplicates = 0;
    for (const event of events) {
      const applied = await this.db.transaction(async (tx) => {
        const inserted = await tx
          .insert(processedEvents)
          .values({ eventId: event.eventId, worldSlug: event.worldSlug, type: event.type, receivedAt: this.clock.now() })
          .onConflictDoNothing()
          .returning({ eventId: processedEvents.eventId });
        if (inserted.length === 0) return false;
        try {
          await tx.transaction((sp) => this.apply(sp, event));
        } catch (err) {
          if (!(err instanceof UnknownAccount)) throw err;
          this.logger.warn(`Zdarzenie ${event.eventId} (${event.type}) dotyczy nieznanego konta, pominięte`);
        }
        return true;
      });
      if (applied) accepted += 1;
      else duplicates += 1;
    }
    return { accepted, duplicates };
  }

  private async apply(tx: AuthDbClient, event: WorldEvent): Promise<void> {
    switch (event.type) {
      case 'WorldStatusChanged':
        await this.worlds.setStatus(tx, event.worldSlug, event.status, this.clock.now());
        return;
      case 'PlayerJoinedWorld':
        try {
          await tx
            .insert(worldMemberships)
            .values({ accountId: event.accountId, worldSlug: event.worldSlug, joinedAt: new Date(event.joinedAt) })
            .onConflictDoUpdate({
              target: [worldMemberships.accountId, worldMemberships.worldSlug],
              set: { joinedAt: new Date(event.joinedAt), leftAt: null },
            });
        } catch (err) {
          if (isForeignKeyViolation(err)) throw new UnknownAccount();
          throw err;
        }
        return;
      case 'PlayerLeftWorld':
        // Odejście sprzed ostatniego dołączenia nie cofa dołączenia.
        await tx
          .update(worldMemberships)
          .set({ leftAt: new Date(event.leftAt) })
          .where(
            and(
              eq(worldMemberships.accountId, event.accountId),
              eq(worldMemberships.worldSlug, event.worldSlug),
              lte(worldMemberships.joinedAt, new Date(event.leftAt)),
            ),
          );
        return;
    }
  }
}
```
Uwaga do testu idempotencji: stara partia ma `joinedAt = 12:00` i `leftAt = 13:00`; nowe dołączenie ma też `joinedAt = 12:00`. Test przechodzi, bo powtórka jest pomijana w całości jako duplikat — warunek `lte` chroni dopiero przed odejściem dostarczonym z opóźnieniem jako nowe zdarzenie.

`apps/auth/src/events/internal-events.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { eventBatchSchema, type EventBatch } from '@islanders/contracts';
import { ZodPipe } from '../common/zod.pipe.js';
import { CurrentServiceWorld, ServiceTokenGuard } from '../tokens/guards.js';
import { EventsService } from './events.service.js';

@ApiTags('internal')
@Controller('internal/v1/events')
@UseGuards(ServiceTokenGuard)
export class InternalEventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @HttpCode(200)
  ingest(
    @CurrentServiceWorld() serviceWorld: string,
    @Body(new ZodPipe(eventBatchSchema)) body: EventBatch,
  ): Promise<{ accepted: number; duplicates: number }> {
    return this.events.ingest(serviceWorld, body.events);
  }
}
```
`apps/auth/src/events/events.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { EventsService } from './events.service.js';
import { InternalEventsController } from './internal-events.controller.js';

@Module({
  imports: [WorldsModule],
  controllers: [InternalEventsController],
  providers: [EventsService],
})
export class EventsModule {}
```
W `apps/auth/src/app.module.ts` dopisz `EventsModule` do `imports`.

Run: `npm run test:e2e -w apps/auth -- events`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Accept idempotent world events and track world memberships in the auth service"
```

---

### Task 11: Sonda dostępności światów

**Files:**
- Create: `packages/platform/src/db/advisory-lock.ts`
- Modify: `packages/platform/src/index.ts`
- Create: `apps/auth/src/probe/{world-probe,world-probe.scheduler,probe.module}.ts`
- Create: `apps/auth/test/probe.e2e-spec.ts`
- Modify: `apps/auth/src/app.module.ts`

**Interfaces:**
- Consumes: `PG_CLIENT` (platform), `WorldsRepository.listAll|setReachable` (Task 9), `withTimeout` (Task 4).
- Produces:
  - platform: `withAdvisoryLock<T>(sql: Sql, key: number, fn: () => Promise<T>): Promise<{ acquired: true; value: T } | { acquired: false }>`
  - auth: `WORLD_PROBE_LOCK_KEY = 71_001`, `WorldProbe.probeOnce(): Promise<boolean>` (`false` = inna replika trzyma blokadę), `WorldProbeScheduler` (interwał `WORLD_PROBE_INTERVAL`, `0` wyłącza)

- [ ] **Step 1: E2E sondy (failing)**

`apps/auth/test/probe.e2e-spec.ts`:
```ts
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeServer } from '@islanders/platform';
import { WorldProbe } from '../src/probe/world-probe.js';
import { bearer, registerAccount, registerWorld } from './support/fixtures.js';
import { testServiceClients } from './support/service-clients.js';
import { createTestApp, type TestApp } from './support/test-app.js';

describe('auth: sonda światów (e2e)', () => {
  let t: TestApp;
  let fakeCore: Server;
  let readyStatus = 200;
  let delayMs = 0;

  beforeAll(async () => {
    fakeCore = createServer((req, res) => {
      setTimeout(() => {
        res.statusCode = req.url === '/health/ready' ? readyStatus : 404;
        res.end();
      }, delayMs);
    });
    await new Promise<void>((resolve) => fakeCore.listen(0, '127.0.0.1', resolve));
    const { port } = fakeCore.address() as AddressInfo;
    t = await createTestApp();
    await registerWorld(t, testServiceClients.world1, { adminUrl: `http://127.0.0.1:${port}` });
  });
  afterAll(async () => {
    await t.close();
    await closeServer(fakeCore);
  });

  const reachable = async () => {
    const a = await registerAccount(t);
    const res = await t.publicHttp().get('/v1/worlds').set('Authorization', bearer(a.accessToken)).expect(200);
    return res.body.find((w: { slug: string }) => w.slug === 'world-1').reachable;
  };

  it('200 z health/ready -> reachable true; 503 -> false', async () => {
    readyStatus = 200;
    expect(await t.app.get(WorldProbe).probeOnce()).toBe(true);
    expect(await reachable()).toBe(true);
    readyStatus = 503;
    await t.app.get(WorldProbe).probeOnce();
    expect(await reachable()).toBe(false);
  });

  it('dwa równoległe przebiegi: jeden pracuje, drugi pomija cykl pod blokadą', async () => {
    readyStatus = 200;
    delayMs = 300;
    try {
      const probe = t.app.get(WorldProbe);
      const results = await Promise.all([probe.probeOnce(), probe.probeOnce()]);
      expect(results.sort()).toEqual([false, true]);
    } finally {
      delayMs = 0;
    }
  });

  it('świat, który nie odpowiada w 2 s, jest niedostępny', async () => {
    readyStatus = 200;
    delayMs = 2_500;
    try {
      await t.app.get(WorldProbe).probeOnce();
      expect(await reachable()).toBe(false);
    } finally {
      delayMs = 0;
    }
  });
});
```
Run: `npm run test:e2e -w apps/auth -- probe`
Expected: FAIL.

- [ ] **Step 2: Blokada doradcza w platform**

`packages/platform/src/db/advisory-lock.ts`:
```ts
import type { Sql } from 'postgres';

/**
 * Praca „jedna na usługę” przy wielu replikach. Blokada sesyjna musi być zdjęta na tym samym
 * połączeniu, na którym ją wzięto, więc rezerwujemy połączenie z puli na czas pracy.
 * Replika, która nie dostanie blokady, pomija cykl — nie czeka.
 */
export async function withAdvisoryLock<T>(
  sql: Sql,
  key: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const conn = await sql.reserve();
  try {
    const [{ locked }] = await conn<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS locked`;
    if (!locked) return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      await conn`SELECT pg_advisory_unlock(${key})`;
    }
  } finally {
    conn.release();
  }
}
```
W `packages/platform/src/index.ts` dopisz `export * from './db/advisory-lock.js';`.

- [ ] **Step 3: Sonda i harmonogram**

`apps/auth/src/probe/world-probe.ts`:
```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Sql } from 'postgres';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, PG_CLIENT, withAdvisoryLock } from '@islanders/platform';
import { WorldsRepository, type WorldRow } from '../worlds/worlds.repository.js';

export const WORLD_PROBE_LOCK_KEY = 71_001;
const PROBE_TIMEOUT_MS = 2_000;

/** Wynik sondy zmienia wyłącznie `reachable`, nigdy `status` świata. */
@Injectable()
export class WorldProbe {
  private readonly logger = new Logger(WorldProbe.name);

  constructor(
    private readonly worlds: WorldsRepository,
    @Inject(PG_CLIENT) private readonly sql: Sql,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async probeOnce(): Promise<boolean> {
    const result = await withAdvisoryLock(this.sql, WORLD_PROBE_LOCK_KEY, async () => {
      const worlds = await this.worlds.listAll();
      await Promise.all(worlds.map((w) => this.probeWorld(w)));
    });
    return result.acquired;
  }

  private async probeWorld(world: WorldRow): Promise<void> {
    let reachable = false;
    try {
      const res = await fetch(new URL('/health/ready', world.adminUrl), {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      reachable = res.ok;
    } catch {
      reachable = false;
    }
    if (!reachable && world.reachable) {
      this.logger.warn(`Świat ${world.slug} przestał odpowiadać`);
    }
    await this.worlds.setReachable(world.slug, reachable, this.clock.now());
  }
}
```
`apps/auth/src/probe/world-probe.scheduler.ts`:
```ts
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { WorldProbe } from './world-probe.js';

@Injectable()
export class WorldProbeScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorldProbeScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly probe: WorldProbe,
    @Inject(ENV) private readonly env: AuthEnv,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.WORLD_PROBE_INTERVAL === 0) return;
    this.timer = setInterval(() => void this.tick(), this.env.WORLD_PROBE_INTERVAL * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.probe.probeOnce();
    } catch (err) {
      this.logger.error('Sonda światów nie powiodła się', err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }
}
```
`apps/auth/src/probe/probe.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WorldsModule } from '../worlds/worlds.module.js';
import { WorldProbe } from './world-probe.js';
import { WorldProbeScheduler } from './world-probe.scheduler.js';

@Module({
  imports: [WorldsModule],
  providers: [WorldProbe, WorldProbeScheduler],
})
export class ProbeModule {}
```
W `apps/auth/src/app.module.ts` dopisz `ProbeModule` do `imports`.

Run: `npm run build -w packages/platform && npm run test:e2e -w apps/auth -- probe`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Probe registered worlds for readiness under an advisory lock"
```

---

### Task 12: Limiter w auth, docker-compose, konfiguracja przykładowa, README

**Files:**
- Create: `apps/auth/test/rate-limit.e2e-spec.ts`
- Create: `docker/postgres-init.sql`, `apps/auth/.env.example`
- Modify: `docker-compose.yml`, `apps/core/.env.example`, `README.md`, `docs/architecture.md` (§9)

**Interfaces:**
- Consumes: wszystko z Tasków 6–11.
- Produces: lokalne środowisko: Postgres z bazami `islanders_auth` i `islanders_world_1`, Redis; auth na 3000/3001, core na 3100.

- [ ] **Step 1: E2E limitera w auth**

`apps/auth/test/rate-limit.e2e-spec.ts`:
```ts
import { createTestApp } from './support/test-app.js';

describe('auth: limiter (e2e)', () => {
  it('logowanie: 10 na minutę z adresu, 429 z Retry-After, kubełek wspólny dla dwóch instancji', async () => {
    const env = { RATE_LIMIT_AUTH_PER_MINUTE: '10', RATE_LIMIT_PREFIX: `rl-auth-${Date.now()}` };
    const one = await createTestApp({ env });
    const two = await createTestApp({ env });
    try {
      const body = { email: 'nikt@test.local', password: 'zle-haslo' };
      for (let i = 0; i < 5; i++) {
        await one.publicHttp().post('/v1/auth/login').send(body).expect(401);
        await two.publicHttp().post('/v1/auth/login').send(body).expect(401);
      }
      const limited = await one.publicHttp().post('/v1/auth/login').send(body).expect(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.headers['x-server-time']).toBeDefined();
    } finally {
      await one.close();
      await two.close();
    }
  });
});
```
Run: `npm run test:e2e -w apps/auth -- rate-limit`
Expected: PASS (bez zmian w kodzie — limiter pochodzi z Tasków 4 i 7).

- [ ] **Step 2: Bazy lokalne**

`docker/postgres-init.sql`:
```sql
-- Wykonywany przez obraz postgres tylko przy pustym wolumenie danych.
CREATE DATABASE islanders_auth;
CREATE DATABASE islanders_world_1;
```
W `docker-compose.yml` w usłudze `postgres` dodaj do `volumes`:
```yaml
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/10-databases.sql:ro
```

- [ ] **Step 3: Konfiguracja przykładowa**

`apps/auth/.env.example`:
```
# Port publiczny (users.islanders.online) i wewnętrzny (/internal, /health)
PORT=3000
ADMIN_PORT=3001
NODE_ENV=development
DATABASE_URL=postgres://islanders:islanders@localhost:5432/islanders_auth
REDIS_URL=redis://localhost:6379
# Wartość `iss` w tokenach; core porówna ją z AUTH_ISSUER po swojej stronie
AUTH_ISSUER=http://localhost:3000
# Wynik `npm run keys:generate -w apps/auth`, jako tablica JSON w jednej linii
JWT_SIGNING_KEYS=[]
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
# Wpisy z `npm run client:create -w apps/auth -- --world world-1`, tablica JSON w jednej linii
SERVICE_CLIENTS=[]
WORLD_PROBE_INTERVAL=30s
SWAGGER_ENABLED=true
RATE_LIMIT_AUTH_PER_MINUTE=10
RATE_LIMIT_SUBJECT_PER_MINUTE=120
RATE_LIMIT_IP_PER_MINUTE=600
RATE_LIMIT_PREFIX=rl-auth
# false | true | liczba przeskoków | lista podsieci po przecinku
TRUST_PROXY=false
```
W `apps/core/.env.example`: `PORT=3100`, `DATABASE_URL=postgres://islanders:islanders@localhost:5432/islanders_world_1`, `RATE_LIMIT_PREFIX=rl-world-1`. Usuń linie `POSTGRES_PORT` i `REDIS_PORT` z `apps/core/.env.example` i przenieś je do nowego pliku `.env.example` w korzeniu:
```
# Porty hosta publikowane przez docker-compose. Zmień, gdy port jest lokalnie zajęty.
POSTGRES_PORT=5432
REDIS_PORT=6379
```

- [ ] **Step 4: Sprawdzenie na żywo**

```bash
npm run compose:down && docker volume rm islandersapi_pgdata 2>/dev/null; npm run compose:up
cp apps/auth/.env.example apps/auth/.env
npm run build
cd apps/auth
KEY=$(node dist/cli/keys-generate.js | tail -1)
CLIENT=$(node dist/cli/client-create.js --world world-1 | tail -1)
sed -i '' "s#^JWT_SIGNING_KEYS=.*#JWT_SIGNING_KEYS=[$KEY]#; s#^SERVICE_CLIENTS=.*#SERVICE_CLIENTS=[$CLIENT]#" .env
node dist/cli/migrate.js
node dist/main.js &
sleep 2
curl -s localhost:3001/health/ready
curl -s -X POST localhost:3000/v1/auth/register -H 'content-type: application/json' \
  -d '{"email":"tech@local.test","nickname":"technik","password":"haslo-testowe-123"}'
node dist/cli/accounts.js roles --email tech@local.test --add admin
curl -s localhost:3000/health/ready
kill %1
cd ../..
```
Expected:
- `/health/ready` na 3001: `{"status":"ok","db":"up","redis":"up",...}`
- rejestracja: JSON z `accountId`, `roles:["player"]`
- CLI: `Role: player, admin`
- `/health/ready` na 3000: 404

Nazwa wolumenu (`islandersapi_pgdata`) zależy od nazwy katalogu; sprawdź `docker volume ls`. Usunięcie wolumenu kasuje lokalne dane — nikt nie jest podłączony, ale uprzedź, jeśli w lokalnej bazie są dane, które chcesz zachować.

- [ ] **Step 5: README i architektura**

`README.md` — zastąp całym:
````markdown
# Islanders — backend

Monorepo backendu gry Islanders (mobilne MMO RTS na archipelagu). Architektura docelowa:
`docs/architecture.md`; decyzje: `docs/adr/`; wytyczne API: `docs/api-guidelines.md`;
roadmapa etapów: `docs/superpowers/specs/2026-09-13-architecture-split-design.md`.
Słownik domeny: `../islanders/CONTEXT.md`.

## Układ

```
apps/core        API świata (NestJS) — na razie dotychczasowy kod gry, wiele światów w jednej bazie (do etapu 2)
apps/auth        usługa kont (NestJS): konta, tokeny EdDSA, JWKS, rejestr światów, zdarzenia
packages/domain      czysta domena gry
packages/contracts   schematy zod wspólne dla usług
packages/platform    wspólna infrastruktura Nest
```

## Start lokalny

```bash
npm install
cp .env.example .env
npm run compose:up                       # Postgres 17 (bazy islanders_auth, islanders_world_1) i Redis 7
npm run build

# auth
cp apps/auth/.env.example apps/auth/.env
npm run keys:generate -w apps/auth       # wpis do JWT_SIGNING_KEYS
npm run db:migrate -w apps/auth
npm run start:dev -w apps/auth           # publiczny :3000, wewnętrzny :3001

# core
cp apps/core/.env.example apps/core/.env # uzupełnij JWT_SECRET
npm run db:migrate -w apps/core
npm run world:create -w apps/core -- --seed 1337 --width 200 --height 200 --wind 0.3,-0.1
npm run start:dev -w apps/core           # :3100, /api/v1
```

Baza `islanders_world_1` powstaje skryptem `docker/postgres-init.sql` tylko przy pustym
wolumenie. Po aktualizacji z wcześniejszej wersji: `npm run compose:down`, usuń wolumen
Postgresa (`docker volume ls`) i `npm run compose:up`.

## Testy

```bash
npm test          # buduje pakiety i uruchamia testy jednostkowe wszystkich workspace'ów
npm run test:e2e  # e2e na Testcontainers — wymaga Dockera
npm run lint
```

Test zgodności geografii w core (`apps/core/src/domain/geography/world-parity.spec.ts`)
czyta `contract/world-parity.json` z repozytorium klienta (`ISLANDERS_CLIENT_DIR`, domyślnie
`../../../islanders` względem `apps/core`). **Nie regeneruj tego pliku z serwera.** Test
zniknie w etapie 3 razem z geografią liczoną z seeda (ADR 0004).

Harness e2e wiąże serwery jawnie z `127.0.0.1` — powód w komentarzu nad `createTestApp`
w `apps/core/test/support/test-app.ts`.

## Auth — komendy technika

```bash
npm run account:roles -w apps/auth -- --email <e> --add tester
echo 'nowe-haslo' | npm run account:set-password -w apps/auth -- --email <e>
npm run account:disable -w apps/auth -- --email <e>
npm run account:enable -w apps/auth -- --email <e>
npm run keys:generate -w apps/auth
npm run client:create -w apps/auth -- --world world-1
```
Komendy kont wymagają zbudowanej aplikacji (`npm run build -w apps/auth`).

## Migracje

Schemat każdej aplikacji leży w jej `src` (Drizzle), migracje SQL w `apps/<app>/drizzle/`.

```bash
npm run db:generate -w apps/<app>
npm run db:migrate -w apps/<app>
```

## Odstępstwa i pozycje przedprodukcyjne

Odstępstwa implementacji od specu A i pozycje przedprodukcyjne: sekcje 4.2 i 15
`docs/superpowers/specs/2026-09-08-backend-foundation-geography-design.md`. Etap 1 zamknął
z nich: limiter na Redisie z limitem po adresie przed uwierzytelnieniem, `TRUST_PROXY`,
rotację refresh tokenu w transakcji (w auth) i wspólne ukrywanie parametrów SQL (`describeError`).
````

`docs/architecture.md` §9, ostatni akapit zastąp:
```markdown
Lokalnie `docker-compose.yml` stawia infrastrukturę: jeden Postgres z osobnymi bazami dla auth
i każdego świata (`docker/postgres-init.sql`) oraz Redis. Aplikacje uruchamia się z npm:
auth na `3000` (publiczny) i `3001` (wewnętrzny), core na `3100` (publiczny) i od etapu 2
na `3101` (wewnętrzny). Obrazy kontenerów aplikacji dochodzą razem z wdrożeniem.
```

- [ ] **Step 6: Weryfikacja końcowa i commit**

```bash
npm install
npm run build
npm test
npm run test:e2e
npm run lint
git status --short
```
Expected: wszystko PASS, drzewo robocze zawiera tylko zmiany z tego zadania.

```bash
git add -A
git commit -m "Add local databases for auth and world-1, example configuration and the monorepo README"
```

---

## Pokrycie specu (samoprzegląd)

| Spec | Zadanie |
|---|---|
| §3.1 układ, skrypty zbiorcze | 1, 2, 3, 5, 6, 12 |
| §3.2 kolejność przebudowy | 1 → 2 → 3 → 5 → 6–11 → 12 |
| §3.3 platform: config, db, http, redis, swagger, time | 3 |
| §3.3 health, internal-server | 6 |
| §3.3 limiter na Redisie, kolejność strażników, `TRUST_PROXY`, `describeError` | 4, 3 |
| §3.4 contracts | 5 |
| §4.1 schemat auth | 6 |
| §4.2 klucze, JWKS, rotacja, TTL tokenów | 7, 8 |
| §4.3 register/login/refresh/logout, blokada | 7, 8 |
| §4.3 tools/login, `GET /v1/worlds` | 8, 9 |
| §4.4 token serwisowy, rejestr, zdarzenia, 404 na porcie publicznym | 9, 10, 6 |
| §4.5 sonda pod blokadą doradczą | 11 |
| §4.6 CLI | 8, 9 |
| §4.7 konfiguracja | 6, 12 |
| §5 testy jednostkowe | 4, 5, 6, 7, 9 |
| §5 testy e2e auth | 6–12 |
| §5 core: testy bez zmian asercji + limiter przed uwierzytelnieniem | 1–4 |

Świadome różnice wobec specu:
- Pakiety budowane `tsc -p` zamiast `tsc -b` (bez project references; kolejność zapewnia `build:packages`).
- Limiter ustawia `PEXPIRE` przy każdym trafieniu na dwukrotność okna zamiast tylko przy wartości 1 — klucz zawiera indeks okna, więc wynik jest ten sam, a nie ma wyścigu między `INCR` i `PEXPIRE`.
- `docker-compose.yml` stawia tylko infrastrukturę; aplikacje startują z npm (spec §3.1 wymienia Postgres i Redis, architektura §9 poprawiona w Task 12).
- Zmienna `RATE_LIMIT_PLAYER_PER_MINUTE` w core przemianowana na `RATE_LIMIT_SUBJECT_PER_MINUTE`, bo podmiotem limitu w auth jest konto, a w core — gracz.
