# Etap 2: core jednego świata — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/core` obsługuje dokładnie jeden świat bez `world_id` i bez własnych kont, weryfikuje tokeny z auth przez JWKS (z zapasem w Redisie), ma port wewnętrzny z health i szkieletem API admina, działa w rolach `all|api|worker`, zgłasza się do rejestru auth i wysyła zdarzenia przez outbox.

**Architecture:** Schemat core zaczyna się od zera z tabelą `world_settings` (jeden wiersz). Nowe moduły: `world/` (ustawienia, status, CLI), `access/` (JWKS, strażnicy), `auth-client/` (token serwisowy, circuit breaker), `outbox/` (zapis i wysyłacz), `admin/`. Moduły gry (`settlements`, `fleets`, dołączanie) tracą `worldId` i przechodzą na `playerId` uuid. Każdy plik e2e dostaje własną bazę sklonowaną z bazy-szablonu i fałszywy serwer auth.

**Tech Stack:** Node 24, NestJS 12 (ESM, Express 5), TypeScript 6, Vitest 4, Drizzle ORM 0.45 + postgres.js, drizzle-kit 0.31, PostgreSQL 17, Redis 7 (ioredis), zod 4.6.4, jose 6, Testcontainers, supertest. Pakiety `@islanders/domain`, `@islanders/contracts`, `@islanders/platform`.

**Spec:** `docs/superpowers/specs/2026-09-14-stage-2-single-world-core-design.md` (nadrzędny: `docs/superpowers/specs/2026-09-13-architecture-split-design.md`, architektura: `docs/architecture.md`).

## Global Constraints

- Gałąź `feat/stage-2-single-world-core` wychodzi z `main` po scaleniu PR #2 (`fix/refresh-lock-order`).
- Po każdym zadaniu `npm test`, `npm run test:e2e` i `npm run lint` w korzeniu są zielone; `apps/auth` bez zmian zachowania.
- Domena: **Player**, **Profile**, **World** — nigdy `account`, `membership`, `user` w identyfikatorach. Komunikaty dla użytkownika i komentarze po polsku, identyfikatory po angielsku, importy względne z `.js`.
- Tokeny: `algorithms: ['EdDSA']`, `issuer: AUTH_ISSUER`; gracz `audience: islanders-worlds`; tools `audience: islanders-tools` + rola `admin`.
- JWKS w Redisie świata: klucz `auth:jwks:<WORLD_SLUG>`, TTL 7 dni (604 800 s). Odświeżanie co godzinę i przy nieznanym `kid`, nie częściej niż raz na 30 s. Timeout pobrania 2 s.
- Brak kluczy w pamięci i w Redisie → 503 „Usługa kont niedostępna” na trasach gracza; `/health/ready` nigdy nie zależy od auth.
- Świat `is_test` → rola `tester` albo `admin`, inaczej 403. Świat `DRAFT` → bez roli `tester`/`admin` 404 „Świat nie istnieje”.
- `WorldWritableGuard`: 409 przy `DRAFT` i `ENDED`. `POST /v1/join`: tylko `OPEN` (409), profil nie może istnieć (409).
- Przejścia statusu bez `--force`: `DRAFT→OPEN`, `OPEN→CLOSED`, `CLOSED→ENDED`; każde inne z `--force`; ten sam status = błąd; do `DRAFT` przy ≥ 1 profilu = błąd także z `--force`.
- `CORE_ROLE`: `all` (domyślnie) — port publiczny + wewnętrzny + prace w tle; `api` — oba porty, bez prac w tle; `worker` — tylko port wewnętrzny z `/health/*`, prace w tle.
- Porty: `PORT` domyślnie 3100 w `.env.example` (w schemacie env bazowo 3000), `ADMIN_PORT` domyślnie 3101. Prefiksy wewnętrzne: `/health`, `/admin`.
- Klient auth: timeout 2 s na wywołanie; token serwisowy odnawiany 60 s przed wygaśnięciem; circuit breaker: 5 kolejnych błędów → otwarty 30 s → jedno żądanie próbne.
- Outbox: cykl co 2 s pod blokadą doradczą (klucz `72_001`); partia ≤ 100 w kolejności `created_at`; backoff wykładniczy od 2 s do 5 min z jitterem (±20 %); 400/401/403 logowane jako `error`; ostrzeżenie, gdy najstarszy niewysłany > 15 min; usuwanie wysłanych starszych niż 7 dni.
- Zgłoszenie świata i wysyłacz outboxa działają tylko w rolach `all` i `worker`.
- Każdy commit kończy stopka:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_012Gmq9cXiWE6LbwKND9QnWN
  ```

## Struktura plików po etapie

```
apps/core/
  drizzle/                      migracje od zera: 0000_citext_extension, 0001_initial_schema, 0002_seed_biome_buildings
  src/
    main.ts                     start wg CORE_ROLE, weryfikacja powiązania ze światem, dwa porty
    bootstrap.ts                configureCoreApp (wspólne dla main i testów)
    app.module.ts
    infra/config/               env (schemat etapu 2), roles (all|api|worker)
    infra/db/schema/            world-settings, profiles, settlements, buildings, fleets, deposits-taken, outbox, enums, index
    world/                      world-status (czyste reguły), world-settings.repository, world-binding, world-writable.guard,
                                world-init.service, world-status.service, world.module
    access/                     refresh-gate (czysta), jwks-provider, token-verifier, player-request, player-token.guard,
                                tools-token.guard, current.decorators, access.module
    modules/profiles/           profiles.repository, profile.guard, profiles.module
    modules/worlds/             world.controller (GET /v1/world, POST /v1/join), world.dto, world-views, join.service,
                                home-island-picker, worlds.module
    modules/settlements/        bez worldId
    modules/fleets/             bez worldId
    admin/                      admin.controller (GET /admin/v1/world), admin.module
    auth-client/                backoff (czysty), circuit-breaker (czysty), auth-client, auth-client.module
    outbox/                     events, outbox.repository, outbox-repository.module, outbox-dispatcher, world-registrar,
                                outbox-dispatch.module
    cli/                        cli.module, world (init|open|close|end|status)
  test/support/                 global-setup (baza-szablon), test-db, test-app, tokens, fake-auth, fake-auth-routes, fixtures
```

Znikają: `src/modules/auth/`, `src/modules/players/`, `src/modules/health/`, `src/cli/create-world.ts`, `src/infra/db/schema/{worlds,players,refresh-tokens}.ts`, `src/infra/http/http.module.ts` (zastępuje go `bootstrap.ts` + providery w `AppModule`), `test/auth.e2e-spec.ts`, `test/worlds.e2e-spec.ts`, `test/health.e2e-spec.ts`, `src/modules/worlds/{worlds.controller,worlds.service,worlds.service.spec,worlds.repository,worlds.dto,profile.guard,profiles.repository,world-writable.guard}.ts`.

---

### Task 1: Czyste reguły: przejścia statusu, backoff, circuit breaker, bramka odświeżania JWKS

Cztery czyste jednostki bez Nest i bez bazy, używane przez kolejne zadania.

**Files:**
- Create: `apps/core/src/world/world-status.ts` (+ `world-status.spec.ts`)
- Create: `apps/core/src/auth-client/backoff.ts` (+ `backoff.spec.ts`)
- Create: `apps/core/src/auth-client/circuit-breaker.ts` (+ `circuit-breaker.spec.ts`)
- Create: `apps/core/src/access/refresh-gate.ts` (+ `refresh-gate.spec.ts`)

**Interfaces:**
- Produces:
  - `type WorldStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'ENDED'` (re-eksport z `@islanders/contracts`)
  - `planStatusChange(input: { from: WorldStatus; to: WorldStatus; force: boolean; profileCount: number }): StatusChangePlan`; `type StatusChangePlan = { ok: true; forced: boolean } | { ok: false; reason: 'SAME_STATUS' | 'NEEDS_FORCE' | 'DRAFT_WITH_PROFILES' }`; `isNaturalTransition(from, to): boolean`
  - `backoffDelayMs(attempts: number, random: () => number): number` (min 2 000, max 300 000, jitter ±20 %); `BACKOFF_MIN_MS = 2_000`, `BACKOFF_MAX_MS = 300_000`
  - `class CircuitBreaker` z `constructor(options: { threshold: number; openMs: number; now: () => number })`, `canRequest(): boolean`, `recordSuccess(): void`, `recordFailure(): void`, `state(): 'closed' | 'open' | 'half-open'`; `class CircuitOpenError extends Error`
  - `class RefreshGate` z `constructor(minIntervalMs: number, now: () => number)`, `tryAcquire(): boolean`

- [ ] **Step 1: Testy (failing)**

`apps/core/src/world/world-status.spec.ts`:
```ts
import { isNaturalTransition, planStatusChange } from './world-status.js';

describe('przejścia statusu świata', () => {
  it('naturalny porządek nie wymaga --force', () => {
    expect(planStatusChange({ from: 'DRAFT', to: 'OPEN', force: false, profileCount: 0 })).toEqual({ ok: true, forced: false });
    expect(planStatusChange({ from: 'OPEN', to: 'CLOSED', force: false, profileCount: 5 })).toEqual({ ok: true, forced: false });
    expect(planStatusChange({ from: 'CLOSED', to: 'ENDED', force: false, profileCount: 5 })).toEqual({ ok: true, forced: false });
    expect(isNaturalTransition('DRAFT', 'CLOSED')).toBe(false);
  });

  it('każde inne przejście wymaga --force', () => {
    expect(planStatusChange({ from: 'CLOSED', to: 'OPEN', force: false, profileCount: 1 })).toEqual({ ok: false, reason: 'NEEDS_FORCE' });
    expect(planStatusChange({ from: 'CLOSED', to: 'OPEN', force: true, profileCount: 1 })).toEqual({ ok: true, forced: true });
    expect(planStatusChange({ from: 'DRAFT', to: 'ENDED', force: true, profileCount: 0 })).toEqual({ ok: true, forced: true });
    expect(planStatusChange({ from: 'ENDED', to: 'CLOSED', force: true, profileCount: 3 })).toEqual({ ok: true, forced: true });
  });

  it('ten sam status to błąd niezależnie od --force', () => {
    expect(planStatusChange({ from: 'OPEN', to: 'OPEN', force: true, profileCount: 0 })).toEqual({ ok: false, reason: 'SAME_STATUS' });
  });

  it('powrót do DRAFT przy istniejących profilach jest zabroniony także z --force', () => {
    expect(planStatusChange({ from: 'OPEN', to: 'DRAFT', force: true, profileCount: 1 })).toEqual({ ok: false, reason: 'DRAFT_WITH_PROFILES' });
    expect(planStatusChange({ from: 'OPEN', to: 'DRAFT', force: true, profileCount: 0 })).toEqual({ ok: true, forced: true });
    expect(planStatusChange({ from: 'OPEN', to: 'DRAFT', force: false, profileCount: 0 })).toEqual({ ok: false, reason: 'NEEDS_FORCE' });
  });
});
```
`apps/core/src/auth-client/backoff.spec.ts`:
```ts
import { BACKOFF_MAX_MS, BACKOFF_MIN_MS, backoffDelayMs } from './backoff.js';

describe('backoff wykładniczy z jitterem', () => {
  const mid = () => 0.5; // jitter zerowy

  it('rośnie dwukrotnie od 2 s i zatrzymuje się na 5 min', () => {
    expect(backoffDelayMs(1, mid)).toBe(2_000);
    expect(backoffDelayMs(2, mid)).toBe(4_000);
    expect(backoffDelayMs(3, mid)).toBe(8_000);
    expect(backoffDelayMs(50, mid)).toBe(BACKOFF_MAX_MS);
  });

  it('jitter mieści się w ±20 % i nie wychodzi poza granice', () => {
    expect(backoffDelayMs(3, () => 0)).toBe(6_400);
    expect(backoffDelayMs(3, () => 0.999999)).toBeLessThanOrEqual(9_600);
    expect(backoffDelayMs(1, () => 0)).toBe(BACKOFF_MIN_MS);
    expect(backoffDelayMs(50, () => 0.999999)).toBe(BACKOFF_MAX_MS);
  });

  it('attempts < 1 traktowane jak pierwsza próba', () => {
    expect(backoffDelayMs(0, mid)).toBe(2_000);
  });
});
```
`apps/core/src/auth-client/circuit-breaker.spec.ts`:
```ts
import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  const make = () => {
    let t = 0;
    const breaker = new CircuitBreaker({ threshold: 5, openMs: 30_000, now: () => t });
    return { breaker, advance: (ms: number) => (t += ms) };
  };

  it('otwiera się po 5 kolejnych błędach, sukces w środku zeruje licznik', () => {
    const { breaker } = make();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    breaker.recordSuccess();
    for (let i = 0; i < 4; i++) breaker.recordFailure();
    expect(breaker.state()).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state()).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('po 30 s przepuszcza jedno żądanie próbne; sukces zamyka, błąd otwiera ponownie', () => {
    const { breaker, advance } = make();
    for (let i = 0; i < 5; i++) breaker.recordFailure();
    advance(29_999);
    expect(breaker.canRequest()).toBe(false);
    advance(1);
    expect(breaker.canRequest()).toBe(true);
    expect(breaker.state()).toBe('half-open');
    expect(breaker.canRequest()).toBe(false);
    breaker.recordFailure();
    expect(breaker.state()).toBe('open');
    advance(30_000);
    expect(breaker.canRequest()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.state()).toBe('closed');
    expect(breaker.canRequest()).toBe(true);
  });
});
```
`apps/core/src/access/refresh-gate.spec.ts`:
```ts
import { RefreshGate } from './refresh-gate.js';

describe('RefreshGate', () => {
  it('przepuszcza pierwsze odświeżenie, potem nie częściej niż raz na 30 s', () => {
    let t = 1_000_000;
    const gate = new RefreshGate(30_000, () => t);
    expect(gate.tryAcquire()).toBe(true);
    t += 29_999;
    expect(gate.tryAcquire()).toBe(false);
    t += 1;
    expect(gate.tryAcquire()).toBe(true);
  });
});
```
Run: `npm run test -w apps/core -- world-status backoff circuit-breaker refresh-gate`
Expected: FAIL (brak modułów).

- [ ] **Step 2: Implementacja**

`apps/core/src/world/world-status.ts`:
```ts
import type { WorldStatus } from '@islanders/contracts';

export type { WorldStatus };

const NATURAL_NEXT: Record<WorldStatus, WorldStatus | null> = {
  DRAFT: 'OPEN',
  OPEN: 'CLOSED',
  CLOSED: 'ENDED',
  ENDED: null,
};

export type StatusChangePlan =
  | { ok: true; forced: boolean }
  | { ok: false; reason: 'SAME_STATUS' | 'NEEDS_FORCE' | 'DRAFT_WITH_PROFILES' };

export function isNaturalTransition(from: WorldStatus, to: WorldStatus): boolean {
  return NATURAL_NEXT[from] === to;
}

/**
 * Reguły zmiany statusu świata. `DRAFT` to świat przygotowywany, zanim ktokolwiek dołączył,
 * więc powrotu do niego nie odblokowuje nawet `--force`, gdy istnieje choć jeden profil.
 */
export function planStatusChange(input: {
  from: WorldStatus;
  to: WorldStatus;
  force: boolean;
  profileCount: number;
}): StatusChangePlan {
  if (input.from === input.to) return { ok: false, reason: 'SAME_STATUS' };
  if (input.to === 'DRAFT' && input.profileCount > 0) {
    return { ok: false, reason: 'DRAFT_WITH_PROFILES' };
  }
  if (isNaturalTransition(input.from, input.to)) return { ok: true, forced: false };
  return input.force ? { ok: true, forced: true } : { ok: false, reason: 'NEEDS_FORCE' };
}
```
`apps/core/src/auth-client/backoff.ts`:
```ts
export const BACKOFF_MIN_MS = 2_000;
export const BACKOFF_MAX_MS = 300_000;
const JITTER = 0.2;

/** Opóźnienie przed kolejną próbą: 2 s · 2^(n−1), ±20 %, obcięte do [2 s, 5 min]. */
export function backoffDelayMs(attempts: number, random: () => number): number {
  const n = Math.max(1, attempts);
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (n - 1));
  const factor = 1 - JITTER + random() * 2 * JITTER;
  return Math.round(Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MIN_MS, base * factor)));
}
```
`apps/core/src/auth-client/circuit-breaker.ts`:
```ts
export class CircuitOpenError extends Error {
  constructor() {
    super('Usługa kont chwilowo odcięta (circuit breaker otwarty)');
    this.name = 'CircuitOpenError';
  }
}

type State = 'closed' | 'open' | 'half-open';

/** Po `threshold` kolejnych błędach odcina wywołania na `openMs`, potem przepuszcza jedno próbne. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private probeInFlight = false;

  constructor(private readonly options: { threshold: number; openMs: number; now: () => number }) {}

  state(): State {
    if (this.openedAt === null) return 'closed';
    return this.options.now() - this.openedAt >= this.options.openMs ? 'half-open' : 'open';
  }

  canRequest(): boolean {
    const state = this.state();
    if (state === 'closed') return true;
    if (state === 'open' || this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openedAt = null;
    this.probeInFlight = false;
  }

  recordFailure(): void {
    if (this.probeInFlight || this.state() === 'half-open') {
      this.probeInFlight = false;
      this.openedAt = this.options.now();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.options.threshold) {
      this.openedAt = this.options.now();
    }
  }
}
```
Uwaga do testu: w stanie `half-open` `state()` zwraca `'half-open'` także po wydaniu żądania próbnego (`canRequest` ustawia `probeInFlight`), więc drugie `canRequest()` zwraca `false`, a `recordFailure()` otwiera obwód na nowo od bieżącej chwili.

`apps/core/src/access/refresh-gate.ts`:
```ts
/** Ogranicza pobieranie JWKS przy nieznanym `kid`, żeby zalew tokenów z losowym `kid` nie bił w auth. */
export class RefreshGate {
  private last: number | null = null;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number,
  ) {}

  tryAcquire(): boolean {
    const t = this.now();
    if (this.last !== null && t - this.last < this.minIntervalMs) return false;
    this.last = t;
    return true;
  }
}
```
W `apps/core/package.json` dopisz zależności `"@islanders/contracts": "0.0.1"` i `"jose": "^6.2.12"`; `npm install`.

Run: `npm run build:packages && npm run test -w apps/core -- world-status backoff circuit-breaker refresh-gate`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npm test && npm run lint
git add -A
git commit -m "Add pure rules for world status changes, backoff, circuit breaker and JWKS refresh gate"
```

---

### Task 2: Schemat od zera i harness e2e z bazą na aplikację

Nowy schemat core (bez `world_id`, z `world_settings` i `outbox`), migracje od zera oraz harness testów, w którym każda aplikacja testowa dostaje własną bazę sklonowaną z szablonu i własny fałszywy serwer auth. W tym zadaniu schemat jest tylko wprowadzany i testowany na poziomie bazy; moduły gry przechodzą na niego w Task 3. Żeby repozytorium pozostało zielone, **stary kod i stare testy e2e core są w tym zadaniu wyłączane z kompilacji i z przebiegu testów**, a Task 3 je zastępuje.

**Files:**
- Delete: `apps/core/drizzle/` (cały katalog), `apps/core/src/infra/db/schema/{worlds,players,refresh-tokens}.ts`
- Create: `apps/core/src/infra/db/schema/{world-settings,outbox}.ts`
- Modify: `apps/core/src/infra/db/schema/{enums,profiles,settlements,buildings,fleets,deposits-taken,index}.ts`
- Create: `apps/core/drizzle/0000_citext_extension.sql`, `0001_initial_schema.sql` (generowana), `0002_seed_biome_buildings.sql`, `meta/*` (generowane)
- Modify: `apps/core/test/support/global-setup.ts`, `apps/core/test/support/vitest.d.ts`
- Create: `apps/core/test/support/{test-db,tokens,fake-auth}.ts`
- Rewrite: `apps/core/test/schema.e2e-spec.ts`
- Modify: `apps/core/vitest.config.e2e.ts`, `apps/core/tsconfig.build.json`, `apps/core/vitest.config.ts` (tymczasowe wyłączenia opisane w Step 1)

**Interfaces:**
- Consumes: `worldSlugSchema`, `WORLD_STATUSES` z `@islanders/contracts`; `citext` z `@islanders/platform/citext`; `runMigrations` z `@islanders/platform`.
- Produces:
  - tabele Drizzle: `worldSettings`, `profiles`, `settlements`, `biomeBuildings`, `buildings`, `fleets`, `depositsTaken`, `outbox`; typ `FleetCargo`; enumy `worldStatus`, `biomeType`, `buildingType`, `missionType`
  - nazwy ograniczeń: `world_settings_singleton`, `world_settings_seed_31bit`, `profiles_pkey`, `profiles_nickname_unique`, `settlements_pk`, `settlements_xy_biome_unique`, `settlements_owner_id_profiles_player_id_fk`, `buildings_pk`, `deposits_taken_pk`, `buildings_settlement_biome_fk`, `buildings_biome_type_fk`, `buildings_level_nonnegative`
  - test: `createTestDatabase(): Promise<string>` (URL nowej bazy), `TEST_ISSUER = 'https://users.islanders.test'`, `testKeys` (`{ publicJwk, privateKey, kid }`), `otherTestKeys`, `signPlayerToken(options?: PlayerTokenOptions): Promise<TestPlayer>`, `signToolsToken(options?: { roles?: Role[]; sub?: string }): Promise<string>`, `interface TestPlayer { id: string; nickname: string; roles: Role[]; token: string }`, `startFakeAuth(options?: { jwks?: { keys: JWK[] } }): Promise<FakeAuth>`, `interface FakeAuth { url: string; requests: RecordedRequest[]; setJwks(jwks: { keys: JWK[] }): void; stop(): Promise<void>; start(): Promise<void>; close(): Promise<void> }`

- [ ] **Step 1: Tymczasowe wyłączenie starego kodu**

Stary kod core (`modules/auth`, `modules/players`, `modules/worlds`, `modules/settlements`, `modules/fleets`, `modules/health`, `cli`, `app.module.ts`, `main.ts`, `infra/http/http.module.ts`, `infra/db/migrate-cli.ts`) importuje tabele, które znikają w tym zadaniu. Task 3 go przepisuje. Do tego czasu:

- `apps/core/tsconfig.build.json` — w `exclude` dopisz `"src/modules/**"`, `"src/cli/**"`, `"src/app.module.ts"`, `"src/main.ts"`, `"src/infra/http/http.module.ts"`, `"src/infra/db/migrate-cli.ts"`.
- `apps/core/vitest.config.ts` — dodaj `exclude: ['src/modules/**', 'node_modules/**', 'dist/**']`.
- `apps/core/vitest.config.e2e.ts` — zmień `include` na `['test/schema.e2e-spec.ts']`.
- Oznacz każdą z tych trzech zmian komentarzem `// TYMCZASOWE (etap 2, Task 2) — usuwa Task 3`.

Uwaga: `apps/core/src/domain/geography` i jego testy (w tym `world-parity.spec.ts`) zostają aktywne.

- [ ] **Step 2: Schemat**

`apps/core/src/infra/db/schema/enums.ts` — `worldStatus` zastąp:
```ts
import { WORLD_STATUSES } from '@islanders/contracts';

export const worldStatus = pgEnum('world_status', WORLD_STATUSES);
```
(pozostałe enumy bez zmian; import `pgEnum` zostaje).

`apps/core/src/infra/db/schema/world-settings.ts`:
```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { worldStatus } from './enums.js';

/** Jeden wiersz: tożsamość i ustawienia świata obsługiwanego przez ten core (ADR 0006). */
export const worldSettings = pgTable(
  'world_settings',
  {
    id: smallint('id').primaryKey().default(1),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: worldStatus('status').notNull().default('DRAFT'),
    isTest: boolean('is_test').notNull().default(false),
    // Do etapu 3 geografia liczy się z seeda; kolumny generatora zastąpią te trzy pola.
    seed: integer('seed').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    windX: doublePrecision('wind_x').notNull().default(0),
    windY: doublePrecision('wind_y').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('world_settings_singleton', sql`${t.id} = 1`),
    check('world_settings_seed_31bit', sql`${t.seed} >= 0 AND ${t.seed} <= 2147483647`),
    check('world_settings_size_positive', sql`${t.width} > 0 AND ${t.height} > 0`),
  ],
);
```
`apps/core/src/infra/db/schema/profiles.ts`:
```ts
import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { citext } from '@islanders/platform/citext';

/** Profile ze słownika: obecność gracza na tym świecie. Pseudonim skopiowany z tokenu przy dołączeniu. */
export const profiles = pgTable('profiles', {
  playerId: uuid('player_id').primaryKey(),
  nickname: citext('nickname').notNull().unique(),
  // NULL w home_* = profil bez osad (przenoszenie po stracie należy do floty).
  homeX: integer('home_x'),
  homeY: integer('home_y'),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
});
```
`apps/core/src/infra/db/schema/settlements.ts` — w tabeli usuń `worldId`, `ownerId` zmień na:
```ts
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.playerId, { onDelete: 'cascade' }),
```
a indeksy i ograniczenia na:
```ts
  (t) => [
    primaryKey({ name: 'settlements_pk', columns: [t.x, t.y] }),
    unique('settlements_xy_biome_unique').on(t.x, t.y, t.biome),
    index('settlements_owner_idx').on(t.ownerId),
  ],
```
Importy: usuń `worlds`, `players`; dodaj `uuid` z `drizzle-orm/pg-core` i `profiles` z `./profiles.js`. Komentarz nad tabelą: `/** Tożsamością osady jest pozycja (ADR 0001 klienta). Biom przechowywany celowo (ADR 0001 API). */`.

`apps/core/src/infra/db/schema/buildings.ts` — w `buildings` usuń `worldId`; klucz główny `primaryKey({ name: 'buildings_pk', columns: [t.x, t.y, t.type] })`; FK osady:
```ts
    foreignKey({
      name: 'buildings_settlement_biome_fk',
      columns: [t.x, t.y, t.biome],
      foreignColumns: [settlements.x, settlements.y, settlements.biome],
    }).onDelete('cascade'),
```
(reszta bez zmian).

`apps/core/src/infra/db/schema/fleets.ts` — usuń `worldId`; `ownerId`:
```ts
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.playerId, { onDelete: 'cascade' }),
```
indeksy: `index('fleets_owner_idx').on(t.ownerId)`, `index('fleets_target_idx').on(t.toX, t.toY)`. Importy: usuń `worlds`, `players`, dodaj `profiles`.

`apps/core/src/infra/db/schema/deposits-taken.ts` — usuń `worldId` i import `worlds`; klucz `primaryKey({ name: 'deposits_taken_pk', columns: [t.x, t.y] })`; komentarz: `/** Ile zabrano ze znaleziska wyliczonego z seeda. Znika w etapie 3 (znaleziska w bazie). */`.

`apps/core/src/infra/db/schema/outbox.ts`:
```ts
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Zdarzenia dla auth, zapisywane w transakcji zmiany, która je wywołała (ADR 0007). `id` = `eventId`. */
export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
  },
  (t) => [index('outbox_pending_idx').on(t.createdAt).where(sql`${t.sentAt} IS NULL`)],
);
```
`apps/core/src/infra/db/schema/index.ts`:
```ts
export * from './enums.js';
export * from './world-settings.js';
export * from './profiles.js';
export * from './settlements.js';
export * from './buildings.js';
export * from './fleets.js';
export * from './deposits-taken.js';
export * from './outbox.js';
```
Usuń pliki `worlds.ts`, `players.ts`, `refresh-tokens.ts`.

- [ ] **Step 3: Migracje od zera**

```bash
rm -rf apps/core/drizzle
npm run build:packages
cd apps/core
npx drizzle-kit generate --custom --name citext_extension
```
Treść `apps/core/drizzle/0000_citext_extension.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS citext;
```
```bash
npx drizzle-kit generate --name initial_schema
npx drizzle-kit generate --custom --name seed_biome_buildings
cd ../..
```
Treść `apps/core/drizzle/0002_seed_biome_buildings.sql`:
```sql
INSERT INTO "biome_buildings" ("biome", "type") VALUES
  ('TROPICAL', 'TOWN_HALL'), ('TROPICAL', 'BARRACKS'), ('TROPICAL', 'SHIPYARD'), ('TROPICAL', 'WAREHOUSE'),
  ('TROPICAL', 'SAWMILL'), ('TROPICAL', 'FARM'),
  ('TEMPERATE', 'TOWN_HALL'), ('TEMPERATE', 'BARRACKS'), ('TEMPERATE', 'SHIPYARD'), ('TEMPERATE', 'WAREHOUSE'),
  ('TEMPERATE', 'QUARRY'), ('TEMPERATE', 'FARM'),
  ('VOLCANIC', 'TOWN_HALL'), ('VOLCANIC', 'BARRACKS'), ('VOLCANIC', 'SHIPYARD'), ('VOLCANIC', 'WAREHOUSE'),
  ('VOLCANIC', 'IRON_MINE'), ('VOLCANIC', 'SULFUR_PIT')
ON CONFLICT DO NOTHING;
```
Sprawdź w `0001_initial_schema.sql` obecność: `world_status` z czterema wartościami, tabel `world_settings`, `profiles`, `settlements`, `biome_buildings`, `buildings`, `fleets`, `deposits_taken`, `outbox`, ograniczeń z sekcji Interfaces i indeksu częściowego `outbox_pending_idx`. Nazwę FK osady do profilu i klucz główny profilu odczytaj z wygenerowanego SQL; jeśli różnią się od `settlements_owner_id_profiles_player_id_fk` / `profiles_pkey`, zapisz faktyczne nazwy w raporcie i używaj ich w kolejnych krokach.

- [ ] **Step 4: Baza na aplikację testową**

`apps/core/test/support/vitest.d.ts`:
```ts
declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
    templateDatabase: string;
    redisUrl: string;
  }
}
export {};
```
`apps/core/test/support/global-setup.ts`:
```ts
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '@islanders/platform';

const TEMPLATE_DATABASE = 'core_template';

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

/**
 * Core obsługuje jeden świat na bazę, więc każda aplikacja testowa dostaje własną bazę.
 * Migracje biegną raz, na bazie-szablonie; kolejne bazy powstają przez `CREATE DATABASE … TEMPLATE`.
 */
export async function setup(project: TestProject): Promise<void> {
  pg = await new PostgreSqlContainer('postgres:17-alpine').start();
  const adminUrl = pg.getConnectionUri();
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${TEMPLATE_DATABASE}"`);
  } finally {
    await admin.end();
  }
  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DATABASE}`;
  await runMigrations(templateUrl.toString(), path.resolve(process.cwd(), 'drizzle'));
  project.provide('pgAdminUrl', adminUrl);
  project.provide('templateDatabase', TEMPLATE_DATABASE);

  redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
}

export async function teardown(): Promise<void> {
  await pg?.stop();
  await redis?.stop();
}
```
`apps/core/test/support/test-db.ts`:
```ts
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';

/** Nowa, zmigrowana baza sklonowana z szablonu; zwraca jej URL. Pliki e2e biegną sekwencyjnie. */
export async function createTestDatabase(): Promise<string> {
  const adminUrl = inject('pgAdminUrl');
  const name = `core_${randomUUID().replace(/-/g, '')}`;
  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}" TEMPLATE "${inject('templateDatabase')}"`);
  } finally {
    await admin.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}
```

- [ ] **Step 5: Tokeny testowe i fałszywy auth**

`apps/core/test/support/tokens.ts`:
```ts
import { randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { AUDIENCE, type Role } from '@islanders/contracts';

export const TEST_ISSUER = 'https://users.islanders.test';

async function makeKeys(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA', use: 'sig' };
  return { kid, privateKey, publicJwk };
}

/** Klucz „auth” dla wszystkich testów procesu; `otherTestKeys` symuluje rotację i nieznany `kid`. */
export const testKeys = await makeKeys('test-key-1');
export const otherTestKeys = await makeKeys('test-key-2');

export interface TestPlayer {
  id: string;
  nickname: string;
  roles: Role[];
  token: string;
}

export interface PlayerTokenOptions {
  id?: string;
  nickname?: string;
  roles?: Role[];
  audience?: string;
  issuer?: string;
  expiresInSeconds?: number;
  keys?: typeof testKeys;
  extraClaims?: Record<string, unknown>;
  omitSub?: boolean;
}

export async function signPlayerToken(options: PlayerTokenOptions = {}): Promise<TestPlayer> {
  const id = options.id ?? randomUUID();
  const nickname = options.nickname ?? `p_${id.replace(/-/g, '').slice(0, 10)}`;
  const roles = options.roles ?? ['player'];
  const keys = options.keys ?? testKeys;
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT({ roles, nickname, ...options.extraClaims })
    .setProtectedHeader({ alg: 'EdDSA', kid: keys.kid, typ: 'JWT' })
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setAudience(options.audience ?? AUDIENCE.worlds)
    .setIssuedAt(now)
    .setExpirationTime(now + (options.expiresInSeconds ?? 900))
    .setJti(randomUUID());
  if (!options.omitSub) jwt = jwt.setSubject(id);
  return { id, nickname, roles, token: await jwt.sign(keys.privateKey) };
}

export async function signToolsToken(options: { roles?: Role[]; sub?: string } = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ roles: options.roles ?? ['player', 'admin'] })
    .setProtectedHeader({ alg: 'EdDSA', kid: testKeys.kid, typ: 'JWT' })
    .setIssuer(TEST_ISSUER)
    .setAudience(AUDIENCE.tools)
    .setSubject(options.sub ?? randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(testKeys.privateKey);
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}
```
Tokeny testowe są podpisywane z zegarem systemowym. Weryfikator w core (Task 3) sprawdza `exp` wobec czasu rzeczywistego, a nie wobec `CLOCK` gry — ważność tokenu jest sprawą bezpieczeństwa, nie czasu rozgrywki — więc testy z `FixedClock` przesuniętym o godziny nie unieważniają tokenów.

`apps/core/test/support/fake-auth.ts`:
```ts
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { JWK } from 'jose';
import { testKeys } from './tokens.js';

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

export type FakeRoute = (req: RecordedRequest, res: ServerResponse) => boolean;

export interface FakeAuth {
  url: string;
  requests: RecordedRequest[];
  setJwks(jwks: { keys: JWK[] }): void;
  addRoute(route: FakeRoute): void;
  stop(): Promise<void>;
  start(): Promise<void>;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : undefined);
      } catch {
        resolve(text);
      }
    });
  });
}

/** Lokalny serwer udający usługę auth: JWKS oraz trasy dokładane przez testy (`addRoute`). */
export async function startFakeAuth(options: { jwks?: { keys: JWK[] } } = {}): Promise<FakeAuth> {
  let jwks = options.jwks ?? { keys: [testKeys.publicJwk] };
  const routes: FakeRoute[] = [];
  const requests: RecordedRequest[] = [];
  let port = 0;
  let server: Server | undefined;

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const recorded: RecordedRequest = {
      method: req.method ?? 'GET',
      path: req.url ?? '/',
      headers: req.headers,
      body: await readBody(req),
    };
    requests.push(recorded);
    if (recorded.method === 'GET' && recorded.path === '/.well-known/jwks.json') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(jwks));
      return;
    }
    for (const route of routes) {
      if (route(recorded, res)) return;
    }
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"statusCode":404}');
  };

  const listen = () =>
    new Promise<void>((resolve, reject) => {
      server = createServer((req, res) => void handler(req, res));
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        port = (server!.address() as AddressInfo).port;
        resolve();
      });
    });
  const shutdown = () =>
    new Promise<void>((resolve) => {
      if (!server) return resolve();
      server.closeAllConnections();
      server.close(() => resolve());
      server = undefined;
    });

  await listen();
  return {
    get url() {
      return `http://127.0.0.1:${port}`;
    },
    requests,
    setJwks: (next) => {
      jwks = next;
    },
    addRoute: (route) => routes.push(route),
    stop: shutdown,
    start: listen,
    close: shutdown,
  };
}
```

- [ ] **Step 6: Test schematu (failing → passing)**

`apps/core/test/schema.e2e-spec.ts` — zastąp całym:
```ts
import { randomUUID } from 'node:crypto';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import {
  biomeBuildings,
  buildings,
  profiles,
  settlements,
  worldSettings,
} from '../src/infra/db/schema/index.js';
import * as schema from '../src/infra/db/schema/index.js';
import { createTestDatabase } from './support/test-db.js';

describe('schemat bazy core (e2e)', () => {
  let client: Sql;
  let db: PostgresJsDatabase<typeof schema>;

  beforeAll(async () => {
    client = postgres(await createTestDatabase(), { max: 2 });
    db = drizzle(client, { schema });
  });
  afterAll(async () => {
    await client.end();
  });

  const world = { slug: 'world-schema', name: 'Schemat', seed: 1337, width: 200, height: 200 };
  const player = async (nickname = `n${randomUUID().slice(0, 8)}`) => {
    const [row] = await db.insert(profiles).values({ playerId: randomUUID(), nickname }).returning();
    return row;
  };

  it('biome_buildings ma 18 wierszy wstawionych migracją', async () => {
    const rows = await db.select().from(biomeBuildings);
    expect(rows).toHaveLength(18);
    expect(rows.filter((r) => r.biome === 'VOLCANIC').map((r) => r.type).sort()).toEqual([
      'BARRACKS', 'IRON_MINE', 'SHIPYARD', 'SULFUR_PIT', 'TOWN_HALL', 'WAREHOUSE',
    ]);
  });

  it('world_settings: jeden wiersz, domyślnie DRAFT, seed w 31 bitach', async () => {
    const [row] = await db.insert(worldSettings).values(world).returning();
    expect(row).toMatchObject({ id: 1, status: 'DRAFT', isTest: false });
    await expect(db.insert(worldSettings).values({ ...world, id: 2 })).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'world_settings_singleton' },
    });
    await expect(db.insert(worldSettings).values({ ...world })).rejects.toMatchObject({
      cause: { code: '23505' },
    });
    await expect(db.update(worldSettings).set({ seed: -1 })).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'world_settings_seed_31bit' },
    });
  });

  it('klucze obce odrzucają budynek spoza biomu, kłamstwo o biomie i osadę bez profilu', async () => {
    const owner = await player();
    const base = { x: 5, y: 5 };
    await db.insert(settlements).values({
      ...base, ownerId: owner.playerId, name: 'Wulkan', biome: 'VOLCANIC',
      wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0, lastSyncAt: new Date(),
    });
    await expect(
      db.insert(buildings).values({ ...base, biome: 'VOLCANIC', type: 'SAWMILL', level: 1 }),
    ).rejects.toMatchObject({ cause: { code: '23503', constraint_name: 'buildings_biome_type_fk' } });
    await expect(
      db.insert(buildings).values({ ...base, biome: 'TROPICAL', type: 'SAWMILL', level: 1 }),
    ).rejects.toMatchObject({ cause: { code: '23503', constraint_name: 'buildings_settlement_biome_fk' } });
    await expect(
      db.insert(buildings).values({ ...base, biome: 'VOLCANIC', type: 'IRON_MINE', level: 1 }),
    ).resolves.toBeDefined();
    await expect(
      db.insert(settlements).values({
        x: 6, y: 6, ownerId: randomUUID(), name: 'Sierota', biome: 'TROPICAL',
        wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0, lastSyncAt: new Date(),
      }),
    ).rejects.toMatchObject({ cause: { code: '23503' } });
  });

  it('pseudonim w profilu jest unikalny bez rozróżniania wielkości liter (citext)', async () => {
    const nick = `Citext${Date.now()}`;
    await player(nick);
    // Inna wielkość liter celowo — dowód, że kolumna ma typ citext, a nie text.
    await expect(player(nick.toUpperCase())).rejects.toMatchObject({
      cause: { code: '23505', constraint_name: 'profiles_nickname_unique' },
    });
  });
});
```
Run: `npm run build:packages && npm run test:e2e -w apps/core`
Expected: PASS (4 testy schematu). Uruchom też `npm test` i `npm run test:e2e -w apps/auth` — bez zmian.

- [ ] **Step 7: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Start the core schema from zero for a single world and give every e2e app its own database"
```

---

### Task 3: Core jednego świata — dostęp przez JWKS, trasy `/v1/*`, moduły gry bez `world_id`

Przepięcie aplikacji na nowy schemat: usunięcie kont z core, weryfikacja tokenów z auth (JWKS w pamięci i w Redisie), trasy gracza bez `/worlds/:id`, profile z uuid. Usuwa tymczasowe wyłączenia z Task 2. Po tym zadaniu core startuje na jednym porcie (port wewnętrzny i role dochodzą w Task 5).

**Files:**
- Delete: `apps/core/src/modules/auth/`, `apps/core/src/modules/players/`, `apps/core/src/modules/health/`, `apps/core/src/cli/create-world.ts`, `apps/core/src/infra/http/{http.module,configure-app}.ts`, `apps/core/src/modules/worlds/{worlds.controller,worlds.service,worlds.service.spec,worlds.repository,worlds.dto,profile.guard,profiles.repository,world-writable.guard,world-writable.guard.spec}.ts`, `apps/core/test/{auth,worlds,health}.e2e-spec.ts`, `apps/core/test/support/fixtures.ts` (stara wersja)
- Rewrite: `apps/core/src/infra/config/env.ts` (+ `env.spec.ts`), `apps/core/src/infra/db/migrate-cli.ts`, `apps/core/src/app.module.ts`, `apps/core/src/main.ts`
- Create: `apps/core/src/bootstrap.ts`
- Create: `apps/core/src/world/{world-settings.repository,world-binding,world-writable.guard,world-writable.guard.spec,world.module}.ts`
- Create: `apps/core/src/access/{jwks-provider,token-verifier,player-request,player-token.guard,current.decorators,access.module}.ts`
- Create: `apps/core/src/modules/profiles/{profiles.repository,profile.guard,profiles.module}.ts`
- Create: `apps/core/src/modules/worlds/{world.controller,world.dto,world-views,world-views.spec,join.service,join.service.spec,worlds.module}.ts` (nowe treści; `home-island-picker.ts` i jego spec bez zmian)
- Rewrite: `apps/core/src/modules/settlements/{settlements.repository,settlements.service,settlement-views,settlements.controller,settlements.dto,settlements.module}.ts`, `settlement-views.spec.ts` (port)
- Rewrite: `apps/core/src/modules/fleets/{fleets.repository,fleet-views,fleets.controller,fleets.dto,fleets.module}.ts`, `fleet-views.spec.ts` (port)
- Create: `apps/core/test/support/{test-app,fixtures}.ts` (nowe), `apps/core/test/{world,access}.e2e-spec.ts`
- Rewrite: `apps/core/test/{settlements,fleets,http}.e2e-spec.ts`
- Revert: tymczasowe wyłączenia z Task 2 Step 1 w `apps/core/tsconfig.build.json`, `apps/core/vitest.config.ts`, `apps/core/vitest.config.e2e.ts` (przywróć `include: ['test/**/*.e2e-spec.ts']` — sprawdź pierwotną wartość w `git show HEAD~1:apps/core/vitest.config.e2e.ts`)
- Modify: `apps/core/package.json` (usuń `@nestjs/jwt`, `argon2`, skrypt `world:create`)

**Interfaces:**
- Consumes: Task 1 `RefreshGate`; Task 2 tabele, `createTestDatabase`, `signPlayerToken`, `signToolsToken`, `bearer`, `startFakeAuth`, `TEST_ISSUER`, `testKeys`, `otherTestKeys`; platform `configureApp`, `RateLimitGuard`, `RateLimitModule`, `withTimeout`, `INTERNAL_REQUEST`, `REDIS`, `DB`, `ENV`, `CLOCK`, `isUniqueViolation`; contracts `AUDIENCE`, `worldsAccessClaimsSchema`, `toolsClaimsSchema`, `Role`, `worldSlugSchema`.
- Produces:
  - `type Env` z polami bazowymi + `WORLD_SLUG`, `AUTH_INTERNAL_URL`, `AUTH_ISSUER`, `ISLANDERS_CLIENT_DIR`; `parseEnv(raw)`
  - `WorldSettingsRepository`: `find(client?): Promise<WorldSettingsRow | undefined>`, `get(): Promise<WorldSettingsRow>` (rzuca `WorldNotInitializedError`), `insert(client, input: InitWorldInput): Promise<WorldSettingsRow>`, `findForUpdate(client): Promise<WorldSettingsRow | undefined>`, `setStatus(client, status: WorldStatus, now: Date): Promise<void>`; `type WorldSettingsRow`; `interface InitWorldInput { slug; name; seed; width; height; windX; windY; isTest; status?: WorldStatus }`; `WorldModule` (globalny)
  - `assertWorldBinding(repo: WorldSettingsRepository, expectedSlug: string): Promise<WorldSettingsRow>`; `class WorldBindingError extends Error`
  - `WorldWritableGuard` (409 na `DRAFT` i `ENDED`)
  - `JwksProvider`: `current(): JWTVerifyGetKey | null`, `refresh(): Promise<boolean>`, `refreshAfterUnknownKid(): Promise<boolean>`; stałe `JWKS_CACHE_TTL_SECONDS = 604_800`, `JWKS_REFRESH_GATE_MS = 30_000`, `jwksCacheKey(slug): string`
  - `TokenVerifier.verify(token: string, audience: 'worlds' | 'tools'): Promise<WorldsAccessClaims | ToolsClaims>` (przeciążenia typów per audience)
  - `interface PlayerPrincipal { id: string; roles: Role[]; nickname: string }`; `interface CoreRequest` z `player?`, `world?`, `profile?`, `rateLimitSubject?`
  - `PlayerTokenGuard` (globalny, pomija żądania z `INTERNAL_REQUEST`); dekoratory `CurrentPlayer()`, `CurrentWorld()`, `CurrentProfile()`
  - `ProfilesRepository`: `find(playerId, client?)`, `create(client, { playerId, nickname, homeX, homeY })`, `count(client?): Promise<number>`; `ProfileGuard`; `ProfilesModule`
  - `JoinService.join(world: WorldSettingsRow, player: PlayerPrincipal, name?: string): Promise<OwnSettlementView>`
  - `worldView(world, profile | undefined): WorldView`
  - `SettlementsRepository` bez `worldId` (`listOwn(ownerId)`, `listInBbox(bbox)`, `findOne(x, y)`, `listCoords()`, `insertWithBuildings(client, input)`); `viewFor(record, worldSlug, requesterId, now)`
  - `FleetsRepository.listVisible(playerId: string)`; `fleetViewFor(record, worldSlug, requesterId)`
  - `configureCoreApp(app, env)`
  - test: `createTestApp(options?: CreateTestAppOptions): Promise<TestApp>`; `interface TestApp { app; http(); db: Db; slug: string; fakeAuth: FakeAuth; databaseUrl: string; close() }`; `joinWorld(t, player, name?)`, `setWorldStatus(t, status)`, `insertProfile(t, player, home?)`

- [ ] **Step 1: Konfiguracja i migrator**

`apps/core/src/infra/config/env.ts` — zastąp całym:
```ts
import { z } from 'zod';
import { worldSlugSchema } from '@islanders/contracts';
import { baseEnvShape, parseEnvWith, withSwaggerDefault } from '@islanders/platform';

export { EnvValidationError } from '@islanders/platform';

export const envSchema = z
  .object({
    ...baseEnvShape,
    WORLD_SLUG: worldSlugSchema,
    AUTH_INTERNAL_URL: z.url(),
    AUTH_ISSUER: z.url(),
    ISLANDERS_CLIENT_DIR: z.string().default('../../../islanders'),
  })
  .transform(withSwaggerDefault);

export type Env = z.output<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return parseEnvWith(envSchema, raw);
}
```
`apps/core/src/infra/config/env.spec.ts` — zastąp całym:
```ts
import { EnvValidationError, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://islanders:islanders@localhost:5432/islanders_world_1',
  WORLD_SLUG: 'world-1',
  AUTH_INTERNAL_URL: 'http://auth:3001',
  AUTH_ISSUER: 'https://users.islanders.online',
};

describe('parseEnv (core)', () => {
  it('stosuje wartości domyślne', () => {
    const env = parseEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.RATE_LIMIT_SUBJECT_PER_MINUTE).toBe(120);
    expect(env.RATE_LIMIT_IP_PER_MINUTE).toBe(600);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.ISLANDERS_CLIENT_DIR).toBe('../../../islanders');
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('wymaga poprawnego sluga świata i adresów auth', () => {
    expect(() => parseEnv({ ...base, WORLD_SLUG: 'World 1' })).toThrow(/WORLD_SLUG/);
    expect(() => parseEnv({ ...base, AUTH_INTERNAL_URL: 'auth' })).toThrow(/AUTH_INTERNAL_URL/);
    const { AUTH_ISSUER: _drop, ...noIssuer } = base;
    expect(() => parseEnv(noIssuer)).toThrow(EnvValidationError);
  });

  it('nie zna już sekretów JWT core', () => {
    expect(parseEnv({ ...base, JWT_SECRET: 'x'.repeat(40) })).not.toHaveProperty('JWT_SECRET');
  });
});
```
`apps/core/src/infra/db/migrate-cli.ts` — zastąp całym (migrator nie potrzebuje reszty konfiguracji świata):
```ts
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { runMigrations } from './migrate.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const url = z
  .string()
  .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL musi zaczynać się od postgres://')
  .parse(process.env.DATABASE_URL);
await runMigrations(url);
console.log('Migracje core zastosowane.');
```
W `apps/core/package.json`: usuń zależności `@nestjs/jwt`, `argon2` i skrypt `world:create`; `npm install`.

- [ ] **Step 2: Świat — repozytorium, weryfikacja przy starcie, strażnik zapisu**

`apps/core/src/world/world-settings.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../infra/db/db.module.js';
import { worldSettings } from '../infra/db/schema/index.js';
import type { WorldStatus } from './world-status.js';

export type WorldSettingsRow = typeof worldSettings.$inferSelect;

export interface InitWorldInput {
  slug: string;
  name: string;
  seed: number;
  width: number;
  height: number;
  windX: number;
  windY: number;
  isTest: boolean;
  status?: WorldStatus;
}

export class WorldNotInitializedError extends Error {
  constructor() {
    super('Baza nie ma świata — uruchom world:init');
    this.name = 'WorldNotInitializedError';
  }
}

@Injectable()
export class WorldSettingsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(client: DbClient = this.db): Promise<WorldSettingsRow | undefined> {
    const [row] = await client.select().from(worldSettings).where(eq(worldSettings.id, 1));
    return row;
  }

  async get(): Promise<WorldSettingsRow> {
    const row = await this.find();
    if (!row) throw new WorldNotInitializedError();
    return row;
  }

  async findForUpdate(client: DbClient): Promise<WorldSettingsRow | undefined> {
    const [row] = await client
      .select()
      .from(worldSettings)
      .where(eq(worldSettings.id, 1))
      .for('update');
    return row;
  }

  async insert(client: DbClient, input: InitWorldInput): Promise<WorldSettingsRow> {
    const [row] = await client.insert(worldSettings).values({ id: 1, ...input }).returning();
    return row;
  }

  async setStatus(client: DbClient, status: WorldStatus, now: Date): Promise<void> {
    await client.update(worldSettings).set({ status, updatedAt: now }).where(eq(worldSettings.id, 1));
  }
}
```
`apps/core/src/world/world-binding.ts`:
```ts
import type { WorldSettingsRepository, WorldSettingsRow } from './world-settings.repository.js';

export class WorldBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorldBindingError';
  }
}

/**
 * Baza jest źródłem prawdy o świecie (ADR 0004, 0006); `WORLD_SLUG` z konfiguracji tylko potwierdza,
 * że proces podpięto do właściwej bazy. Niezgodność to błąd startu, nie ostrzeżenie.
 */
export async function assertWorldBinding(
  repo: WorldSettingsRepository,
  expectedSlug: string,
): Promise<WorldSettingsRow> {
  const row = await repo.find();
  if (!row) {
    throw new WorldBindingError('Baza nie ma świata — uruchom world:init');
  }
  if (row.slug !== expectedSlug) {
    throw new WorldBindingError(
      `Baza należy do świata ${row.slug}, a WORLD_SLUG wskazuje ${expectedSlug}`,
    );
  }
  return row;
}
```
`apps/core/src/world/world-writable.guard.ts`:
```ts
import { CanActivate, ConflictException, ExecutionContext, Injectable } from '@nestjs/common';
import type { CoreRequest } from '../access/player-request.js';

/** Zapisy tylko na OPEN i CLOSED; DRAFT jest niegotowy, ENDED tylko do odczytu. Zakładać po ProfileGuard. */
@Injectable()
export class WorldWritableGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<CoreRequest>();
    if (!req.world) {
      throw new Error('WorldWritableGuard wymaga PlayerTokenGuard i ProfileGuard przed sobą');
    }
    if (req.world.status === 'ENDED') {
      throw new ConflictException('Runda zakończona, świat jest tylko do odczytu');
    }
    if (req.world.status === 'DRAFT') {
      throw new ConflictException('Świat jest jeszcze przygotowywany');
    }
    return true;
  }
}
```
`apps/core/src/world/world-writable.guard.spec.ts`:
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

  it('DRAFT i ENDED -> 409', () => {
    expect(() => guard.canActivate(contextWithWorld('ENDED'))).toThrow(ConflictException);
    expect(() => guard.canActivate(contextWithWorld('DRAFT'))).toThrow(ConflictException);
  });

  it('bez strażników przed sobą zgłasza błąd programisty, nie 409', () => {
    expect(() => guard.canActivate(contextWithWorld(undefined))).toThrow(/PlayerTokenGuard/);
  });
});
```
`apps/core/src/world/world.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { WorldSettingsRepository } from './world-settings.repository.js';
import { WorldWritableGuard } from './world-writable.guard.js';

@Global()
@Module({
  providers: [WorldSettingsRepository, WorldWritableGuard],
  exports: [WorldSettingsRepository, WorldWritableGuard],
})
export class WorldModule {}
```

- [ ] **Step 3: Dostęp — JWKS, weryfikator, strażnik gracza**

`apps/core/src/access/player-request.ts`:
```ts
import type { Request } from 'express';
import type { Role } from '@islanders/contracts';
import type { ProfileRow } from '../modules/profiles/profiles.repository.js';
import type { WorldSettingsRow } from '../world/world-settings.repository.js';

export interface PlayerPrincipal {
  id: string;
  roles: Role[];
  nickname: string;
}

export interface CoreRequest extends Request {
  player?: PlayerPrincipal;
  world?: WorldSettingsRow;
  profile?: ProfileRow;
  rateLimitSubject?: string;
}
```
`apps/core/src/access/jwks-provider.ts`:
```ts
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createLocalJWKSet, type JSONWebKeySet, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';
import { ENV, REDIS, type RedisClient, withTimeout } from '@islanders/platform';
import type { Env } from '../infra/config/env.js';
import { RefreshGate } from './refresh-gate.js';

export const JWKS_CACHE_TTL_SECONDS = 604_800;
export const JWKS_REFRESH_GATE_MS = 30_000;
const REFRESH_INTERVAL_MS = 3_600_000;
const FETCH_TIMEOUT_MS = 2_000;
const REDIS_TIMEOUT_MS = 500;

const jwksSchema = z.object({
  keys: z.array(z.looseObject({ kty: z.string(), kid: z.string() })).min(1),
});

/** Klucz Redisa świata; slug w kluczu chroni przed pomyłką, gdy dwa światy dzielą instancję Redisa. */
export function jwksCacheKey(slug: string): string {
  return `auth:jwks:${slug}`;
}

/**
 * Klucze publiczne auth w pamięci procesu i w Redisie świata. Świeża replika bez dostępu do auth
 * weryfikuje tokeny kluczami z Redisa (etap 2 spec §4.1).
 */
@Injectable()
export class JwksProvider implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JwksProvider.name);
  private readonly gate = new RefreshGate(JWKS_REFRESH_GATE_MS, () => Date.now());
  private keySet: JWTVerifyGetKey | null = null;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.loadFromCache();
    if (this.keySet) {
      void this.refresh();
    } else {
      await this.refresh();
    }
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  current(): JWTVerifyGetKey | null {
    return this.keySet;
  }

  /** Odświeżenie wywołane nieznanym `kid` albo brakiem kluczy — nie częściej niż raz na 30 s. */
  async refreshAfterUnknownKid(): Promise<boolean> {
    if (!this.gate.tryAcquire()) return false;
    return this.refresh();
  }

  async refresh(): Promise<boolean> {
    let jwks: z.infer<typeof jwksSchema>;
    try {
      const res = await fetch(new URL('/.well-known/jwks.json', this.env.AUTH_INTERNAL_URL), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      jwks = jwksSchema.parse(await res.json());
    } catch (err) {
      this.logger.warn(`Nie udało się pobrać JWKS z auth: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    this.use(jwks);
    try {
      await withTimeout(
        this.redis.set(jwksCacheKey(this.env.WORLD_SLUG), JSON.stringify(jwks), 'EX', JWKS_CACHE_TTL_SECONDS),
        REDIS_TIMEOUT_MS,
      );
    } catch (err) {
      this.logger.warn(`Nie udało się zapisać JWKS w Redisie: ${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  }

  private async loadFromCache(): Promise<void> {
    try {
      const raw = await withTimeout(this.redis.get(jwksCacheKey(this.env.WORLD_SLUG)), REDIS_TIMEOUT_MS);
      if (raw) this.use(jwksSchema.parse(JSON.parse(raw)));
    } catch (err) {
      this.logger.warn(`Nie udało się odczytać JWKS z Redisa: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private use(jwks: z.infer<typeof jwksSchema>): void {
    this.keySet = createLocalJWKSet(jwks as unknown as JSONWebKeySet);
  }
}
```
`apps/core/src/access/token-verifier.ts`:
```ts
import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  AUDIENCE,
  toolsClaimsSchema,
  worldsAccessClaimsSchema,
  type ToolsClaims,
  type WorldsAccessClaims,
} from '@islanders/contracts';
import { ENV } from '@islanders/platform';
import type { Env } from '../infra/config/env.js';
import { JwksProvider } from './jwks-provider.js';

/**
 * Weryfikacja tokenu z auth. Ważność (`exp`) liczona wobec czasu rzeczywistego, nie zegara gry.
 * Nieznany `kid` wymusza jedno odświeżenie JWKS (z bramką 30 s) i ponowną próbę.
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly jwks: JwksProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  verify(token: string, audience: 'worlds'): Promise<WorldsAccessClaims>;
  verify(token: string, audience: 'tools'): Promise<ToolsClaims>;
  async verify(token: string, audience: 'worlds' | 'tools'): Promise<WorldsAccessClaims | ToolsClaims> {
    let keySet = this.jwks.current();
    if (!keySet && (await this.jwks.refreshAfterUnknownKid())) {
      keySet = this.jwks.current();
    }
    if (!keySet) {
      throw new ServiceUnavailableException('Usługa kont niedostępna');
    }
    try {
      return await this.check(token, audience, keySet);
    } catch (err) {
      if (err instanceof errors.JWKSNoMatchingKey && (await this.jwks.refreshAfterUnknownKid())) {
        try {
          return await this.check(token, audience, this.jwks.current()!);
        } catch {
          throw new UnauthorizedException('Token nieważny lub wygasły');
        }
      }
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
  }

  private async check(
    token: string,
    audience: 'worlds' | 'tools',
    keySet: JWTVerifyGetKey,
  ): Promise<WorldsAccessClaims | ToolsClaims> {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: this.env.AUTH_ISSUER,
      audience: AUDIENCE[audience],
      algorithms: ['EdDSA'],
    });
    return audience === 'worlds' ? worldsAccessClaimsSchema.parse(payload) : toolsClaimsSchema.parse(payload);
  }
}
```
`apps/core/src/access/player-token.guard.ts`:
```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Role } from '@islanders/contracts';
import { INTERNAL_REQUEST } from '@islanders/platform';
import { WorldSettingsRepository } from '../world/world-settings.repository.js';
import type { CoreRequest } from './player-request.js';
import { TokenVerifier } from './token-verifier.js';

const PRIVILEGED: Role[] = ['tester', 'admin'];

/**
 * Globalny strażnik tras gracza. Żądania portu wewnętrznego pomija — tam obowiązuje ToolsTokenGuard.
 * DRAFT jest niewidoczny dla graczy poza testerami (404), świat testowy wymaga roli testera (403).
 */
@Injectable()
export class PlayerTokenGuard implements CanActivate {
  constructor(
    private readonly verifier: TokenVerifier,
    private readonly worlds: WorldSettingsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CoreRequest>();
    if ((req as unknown as Record<symbol, unknown>)[INTERNAL_REQUEST] === true) return true;
    // RFC 7235: schemat uwierzytelnienia jest nieczuły na wielkość znaków.
    const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Brak tokenu');
    const claims = await this.verifier.verify(token, 'worlds');
    const world = await this.worlds.get();
    const privileged = claims.roles.some((r) => PRIVILEGED.includes(r));
    if (world.status === 'DRAFT' && !privileged) {
      throw new NotFoundException('Świat nie istnieje');
    }
    if (world.isTest && !privileged) {
      throw new ForbiddenException('Świat testowy jest dostępny tylko dla testerów');
    }
    req.player = { id: claims.sub, roles: claims.roles, nickname: claims.nickname };
    req.world = world;
    req.rateLimitSubject = `player:${claims.sub}`;
    return true;
  }
}
```
`apps/core/src/access/current.decorators.ts`:
```ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ProfileRow } from '../modules/profiles/profiles.repository.js';
import type { WorldSettingsRow } from '../world/world-settings.repository.js';
import type { CoreRequest, PlayerPrincipal } from './player-request.js';

const request = (ctx: ExecutionContext) => ctx.switchToHttp().getRequest<CoreRequest>();

export const CurrentPlayer = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlayerPrincipal => request(ctx).player!,
);
export const CurrentWorld = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorldSettingsRow => request(ctx).world!,
);
export const CurrentProfile = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ProfileRow => request(ctx).profile!,
);
```
`apps/core/src/access/access.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '@islanders/platform';
import { JwksProvider } from './jwks-provider.js';
import { PlayerTokenGuard } from './player-token.guard.js';
import { TokenVerifier } from './token-verifier.js';

/**
 * Kolejność globalnych strażników jest kolejnością rejestracji: PlayerTokenGuard musi działać
 * przed RateLimitGuard, żeby limiter widział `req.rateLimitSubject`. Oba w jednej tablicy providerów.
 */
@Module({
  providers: [
    JwksProvider,
    TokenVerifier,
    { provide: APP_GUARD, useClass: PlayerTokenGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [JwksProvider, TokenVerifier],
})
export class AccessModule {}
```

- [ ] **Step 4: Profile**

`apps/core/src/modules/profiles/profiles.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { profiles } from '../../infra/db/schema/index.js';

export type ProfileRow = typeof profiles.$inferSelect;

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(playerId: string, client: DbClient = this.db): Promise<ProfileRow | undefined> {
    const [row] = await client.select().from(profiles).where(eq(profiles.playerId, playerId));
    return row;
  }

  /** Rzuca 23505 na `profiles_pkey` (profil istnieje) albo `profiles_nickname_unique`. */
  async create(
    client: DbClient,
    input: { playerId: string; nickname: string; homeX: number | null; homeY: number | null },
  ): Promise<ProfileRow> {
    const [row] = await client.insert(profiles).values(input).returning();
    return row;
  }

  async count(client: DbClient = this.db): Promise<number> {
    const [row] = await client.select({ value: count() }).from(profiles);
    return Number(row.value);
  }
}
```
`apps/core/src/modules/profiles/profile.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { CoreRequest } from '../../access/player-request.js';
import { ProfilesRepository } from './profiles.repository.js';

/** Wymaga profilu gracza na tym świecie. Nie sprawdza statusu — odczyt działa na każdym widocznym świecie. */
@Injectable()
export class ProfileGuard implements CanActivate {
  constructor(private readonly profiles: ProfilesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<CoreRequest>();
    if (!req.player) {
      throw new Error('ProfileGuard wymaga PlayerTokenGuard przed sobą');
    }
    const profile = await this.profiles.find(req.player.id);
    if (!profile) {
      throw new ForbiddenException('Nie masz profilu na tym świecie');
    }
    req.profile = profile;
    return true;
  }
}
```
`apps/core/src/modules/profiles/profiles.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ProfileGuard } from './profile.guard.js';
import { ProfilesRepository } from './profiles.repository.js';

/** Wydzielony moduł profili rozcina dawny cykl WorldsModule ⇄ SettlementsModule (spec A §15.2). */
@Module({
  providers: [ProfilesRepository, ProfileGuard],
  exports: [ProfilesRepository, ProfileGuard],
})
export class ProfilesModule {}
```

- [ ] **Step 5: Osady bez `world_id`**

`apps/core/src/modules/settlements/settlement-views.ts` — zmiany:
- w `SettlementRecord` usuń `worldId`, `ownerId: string`;
- w `PublicSettlementView` `ownerId: string` (pole `world: string` zostaje i niesie slug świata);
- sygnatury i ciała:
```ts
export function publicView(s: SettlementRecord, worldSlug: string): PublicSettlementView {
  return { world: worldSlug, x: s.x, y: s.y, ownerId: s.ownerId, ownerName: s.ownerName, name: s.name };
}

/** Zasoby zmaterializowane leniwie na `now` bez zapisu; `lastSyncAt = now`, żeby klient ekstrapolował od tej chwili. */
export function ownView(s: SettlementRecord, worldSlug: string, now: Date): OwnSettlementView {
  const rate = productionPerHour(s.biome, s.buildings);
  const capacity = capacityFor(s.buildings);
  return {
    ...publicView(s, worldSlug),
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
export function viewFor(
  s: SettlementRecord,
  worldSlug: string,
  requesterId: string,
  now: Date,
): PublicSettlementView | OwnSettlementView {
  return s.ownerId === requesterId ? ownView(s, worldSlug, now) : publicView(s, worldSlug);
}
```
`apps/core/src/modules/settlements/settlement-views.spec.ts` — port: w każdym rekordzie testowym usuń `worldId`, `ownerId` zamień na uuid-y (np. `const OWNER = '00000000-0000-4000-8000-000000000001'`, `const OTHER = '00000000-0000-4000-8000-000000000002'`), wywołania `publicView(r)` → `publicView(r, 'world-1')`, `ownView(r, now)` → `ownView(r, 'world-1', now)`, `viewFor(r, requester, now)` → `viewFor(r, 'world-1', requester, now)`, a oczekiwane `world: '7'` (lub inny numer) → `world: 'world-1'`. Asercje o braku klucza `resources` w cudzej osadzie zostają bez zmian.

`apps/core/src/modules/settlements/settlements.repository.ts` — zastąp całym:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, between, eq, type SQL } from 'drizzle-orm';
import type { Biome, Building, BuildingLevels, Resources } from '@islanders/domain/rules';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { buildings, profiles, settlements } from '../../infra/db/schema/index.js';
import { type Bbox, coordKey } from './bbox.js';
import type { SettlementRecord } from './settlement-views.js';

export interface InsertSettlementInput {
  x: number;
  y: number;
  ownerId: string;
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

  listOwn(ownerId: string): Promise<SettlementRecord[]> {
    return this.load(eq(settlements.ownerId, ownerId));
  }

  listInBbox(bbox: Bbox): Promise<SettlementRecord[]> {
    return this.load(
      and(between(settlements.x, bbox.x1, bbox.x2), between(settlements.y, bbox.y1, bbox.y2))!,
    );
  }

  async findOne(x: number, y: number): Promise<SettlementRecord | undefined> {
    const [row] = await this.load(and(eq(settlements.x, x), eq(settlements.y, y))!);
    return row;
  }

  /** Klucze "x:y" wszystkich osad świata — do sprawdzania, czy wyspa jest zajęta. */
  async listCoords(): Promise<Set<string>> {
    const rows = await this.db.select({ x: settlements.x, y: settlements.y }).from(settlements);
    return new Set(rows.map((r) => coordKey(r.x, r.y)));
  }

  /** Osada i jej sześć slotów w transakcji wywołującego. Rzuca 23505 na `settlements_pk`, gdy wyspa zajęta. */
  async insertWithBuildings(client: DbClient, input: InsertSettlementInput): Promise<void> {
    await client.insert(settlements).values({
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
        x: input.x,
        y: input.y,
        biome: input.biome,
        type,
        level,
      })),
    );
  }

  private async load(where: SQL): Promise<SettlementRecord[]> {
    const rows = await this.db
      .select({
        x: settlements.x,
        y: settlements.y,
        ownerId: settlements.ownerId,
        ownerName: profiles.nickname,
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
      .innerJoin(profiles, eq(profiles.playerId, settlements.ownerId))
      .where(where);
    if (rows.length === 0) return [];

    const bases: SettlementBase[] = rows.map((r) => ({
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

    // Złączenie z tym samym warunkiem co osady: `inArray` po x i po y osobno dałoby iloczyn
    // kartezjański i wciągnęło budynki cudzych osad o współrzędnych mieszanych z dwóch wierszy.
    const levels = await this.db
      .select({ x: buildings.x, y: buildings.y, type: buildings.type, level: buildings.level })
      .from(buildings)
      .innerJoin(settlements, and(eq(settlements.x, buildings.x), eq(settlements.y, buildings.y)))
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
`apps/core/src/modules/settlements/settlements.service.ts` — zastąp całym:
```ts
import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import { CLOCK } from '../../infra/time/time.module.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
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
  async list(
    world: WorldSettingsRow,
    requesterId: string,
    bboxRaw?: string,
  ): Promise<(PublicSettlementView | OwnSettlementView)[]> {
    const now = this.clock.now();
    const records =
      bboxRaw === undefined
        ? await this.settlements.listOwn(requesterId)
        : await this.settlements.listInBbox(parseBbox(bboxRaw, world));
    return records.map((r) => viewFor(r, world.slug, requesterId, now));
  }
}
```
`apps/core/src/modules/settlements/settlements.controller.ts` — zastąp całym:
```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBearerAuth, ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer, CurrentWorld } from '../../access/current.decorators.js';
import type { PlayerPrincipal } from '../../access/player-request.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfileGuard } from '../profiles/profile.guard.js';
import { SettlementDto } from './settlements.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('settlements')
@ApiBearerAuth()
@Controller('v1/settlements')
@UseGuards(ProfileGuard)
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get()
  @ApiQuery({ name: 'bbox', required: false, example: '60,60,100,100', description: 'x1,y1,x2,y2 — domknięty, ≤ 4096 komórek' })
  @ApiOkResponse({ type: [SettlementDto] })
  @ApiBadRequestResponse({ description: 'Zły bbox' })
  list(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
    @Query('bbox') bbox?: string,
  ): Promise<SettlementDto[]> {
    return this.service.list(world, player.id, bbox);
  }
}
```
Uwaga (znany problem Nest): parametry typowane `import type` nie trafiają do metadanych jako klasy DTO, więc globalny `ValidationPipe` ich nie waliduje — tak ma być, to obiekty ze strażników.

`apps/core/src/modules/settlements/settlements.dto.ts` — `@ApiProperty({ example: '1' }) world` → `@ApiProperty({ example: 'world-1' }) world!: string;`, `@ApiProperty() ownerId!: number;` → `@ApiProperty({ format: 'uuid' }) ownerId!: string;`.

`apps/core/src/modules/settlements/settlements.module.ts` — zastąp całym:
```ts
import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsRepository } from './settlements.repository.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [ProfilesModule],
  controllers: [SettlementsController],
  providers: [SettlementsRepository, SettlementsService],
  exports: [SettlementsRepository],
})
export class SettlementsModule {}
```

- [ ] **Step 6: Floty bez `world_id`**

`apps/core/src/modules/fleets/fleet-views.ts` — w `FleetRecord` usuń `worldId`, `ownerId: string`; w `IncomingFleetView` `ownerId: string`; funkcje:
```ts
export function incomingFleetView(f: FleetRecord, worldSlug: string): IncomingFleetView {
  return {
    id: f.id,
    world: worldSlug,
    ownerId: f.ownerId,
    ownerName: f.ownerName,
    mission: f.mission,
    from: { x: f.fromX, y: f.fromY },
    to: { x: f.toX, y: f.toY },
    departAt: f.departAt.toISOString(),
    arriveAt: f.arriveAt.toISOString(),
  };
}

export function ownFleetView(f: FleetRecord, worldSlug: string): OwnFleetView {
  return { ...incomingFleetView(f, worldSlug), ships: f.ships, cargo: f.cargo };
}

export function fleetViewFor(f: FleetRecord, worldSlug: string, requesterId: string): OwnFleetView | IncomingFleetView {
  return f.ownerId === requesterId ? ownFleetView(f, worldSlug) : incomingFleetView(f, worldSlug);
}
```
`apps/core/src/modules/fleets/fleet-views.spec.ts` — port analogiczny do `settlement-views.spec.ts`: rekordy bez `worldId`, `ownerId` jako stałe uuid, drugi argument `'world-1'` w każdym wywołaniu, oczekiwane `world: 'world-1'`. Asercje o braku `ships`/`cargo` w nadchodzącej flocie bez zmian.

`apps/core/src/modules/fleets/fleets.repository.ts` — zastąp całym:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, isNull, or } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { fleets, profiles, settlements } from '../../infra/db/schema/index.js';
import type { FleetRecord } from './fleet-views.js';

@Injectable()
export class FleetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Nierozstrzygnięte floty gracza oraz cudze ATTACK, których celem jest osada gracza. */
  listVisible(playerId: string): Promise<FleetRecord[]> {
    const targetsMine = exists(
      this.db
        .select({ x: settlements.x })
        .from(settlements)
        .where(
          and(
            eq(settlements.x, fleets.toX),
            eq(settlements.y, fleets.toY),
            eq(settlements.ownerId, playerId),
          ),
        ),
    );
    return this.db
      .select({
        id: fleets.id,
        ownerId: fleets.ownerId,
        ownerName: profiles.nickname,
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
      .innerJoin(profiles, eq(profiles.playerId, fleets.ownerId))
      .where(
        and(
          isNull(fleets.resolvedAt),
          or(eq(fleets.ownerId, playerId), and(eq(fleets.mission, 'ATTACK'), targetsMine)),
        ),
      )
      .orderBy(asc(fleets.arriveAt));
  }
}
```
`apps/core/src/modules/fleets/fleets.controller.ts` — zastąp całym:
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer, CurrentWorld } from '../../access/current.decorators.js';
import type { PlayerPrincipal } from '../../access/player-request.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfileGuard } from '../profiles/profile.guard.js';
import { fleetViewFor } from './fleet-views.js';
import { FleetDto } from './fleets.dto.js';
import { FleetsRepository } from './fleets.repository.js';

@ApiTags('fleets')
@ApiBearerAuth()
@Controller('v1/fleets')
@UseGuards(ProfileGuard)
export class FleetsController {
  constructor(private readonly fleets: FleetsRepository) {}

  @Get()
  @ApiOkResponse({ type: [FleetDto] })
  async list(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
  ): Promise<FleetDto[]> {
    const rows = await this.fleets.listVisible(player.id);
    return rows.map((f) => fleetViewFor(f, world.slug, player.id));
  }
}
```
`apps/core/src/modules/fleets/fleets.dto.ts` — `world` z przykładem `'world-1'`, `ownerId` jako `string` z `format: 'uuid'`.

`apps/core/src/modules/fleets/fleets.module.ts` — zastąp całym:
```ts
import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { FleetsController } from './fleets.controller.js';
import { FleetsRepository } from './fleets.repository.js';

@Module({
  imports: [ProfilesModule],
  controllers: [FleetsController],
  providers: [FleetsRepository],
  exports: [FleetsRepository],
})
export class FleetsModule {}
```

- [ ] **Step 7: Świat gracza — widok, dołączanie, kontroler**

`apps/core/src/modules/worlds/world-views.ts` — zastąp całym:
```ts
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import type { ProfileRow } from '../profiles/profiles.repository.js';

export interface WorldView {
  slug: string;
  name: string;
  status: WorldSettingsRow['status'];
  isTest: boolean;
  /** Do etapu 3 klient liczy geografię z seeda. */
  seed: number;
  size: { w: number; h: number };
  wind: { x: number; y: number };
  profile: { playerId: string; homeSettlement: { x: number; y: number } | null } | null;
}

/** `GET /v1/world`: dane publiczne świata i profil gracza albo `null` przed dołączeniem. `serverTime` dokłada interceptor. */
export function worldView(world: WorldSettingsRow, profile: ProfileRow | undefined): WorldView {
  return {
    slug: world.slug,
    name: world.name,
    status: world.status,
    isTest: world.isTest,
    seed: world.seed,
    size: { w: world.width, h: world.height },
    wind: { x: world.windX, y: world.windY },
    profile: profile
      ? {
          playerId: profile.playerId,
          homeSettlement:
            profile.homeX === null || profile.homeY === null ? null : { x: profile.homeX, y: profile.homeY },
        }
      : null,
  };
}
```
`apps/core/src/modules/worlds/world-views.spec.ts`:
```ts
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import type { ProfileRow } from '../profiles/profiles.repository.js';
import { worldView } from './world-views.js';

const world: WorldSettingsRow = {
  id: 1, slug: 'world-1', name: 'Świat 1', status: 'OPEN', isTest: false, seed: 1337,
  width: 200, height: 100, windX: 0.3, windY: -0.1,
  createdAt: new Date('2026-09-14T00:00:00Z'), updatedAt: new Date('2026-09-14T00:00:00Z'),
};
const profile = (home: { x: number; y: number } | null): ProfileRow => ({
  playerId: '00000000-0000-4000-8000-000000000001',
  nickname: 'kapitan',
  homeX: home?.x ?? null,
  homeY: home?.y ?? null,
  joinedAt: new Date('2026-09-14T00:00:00Z'),
});

describe('worldView', () => {
  it('bez profilu: dane publiczne i profile = null', () => {
    expect(worldView(world, undefined)).toEqual({
      slug: 'world-1', name: 'Świat 1', status: 'OPEN', isTest: false, seed: 1337,
      size: { w: 200, h: 100 }, wind: { x: 0.3, y: -0.1 }, profile: null,
    });
  });

  it('z profilem i osadą domową', () => {
    expect(worldView(world, profile({ x: 5, y: 7 })).profile).toEqual({
      playerId: '00000000-0000-4000-8000-000000000001',
      homeSettlement: { x: 5, y: 7 },
    });
  });

  it('z profilem bez osady domowej', () => {
    expect(worldView(world, profile(null)).profile?.homeSettlement).toBeNull();
  });
});
```
`apps/core/src/modules/worlds/world.dto.ts`:
```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length } from 'class-validator';

class SizeDto {
  @ApiProperty() w!: number;
  @ApiProperty() h!: number;
}
class VectorDto {
  @ApiProperty() x!: number;
  @ApiProperty() y!: number;
}
class WorldProfileDto {
  @ApiProperty({ format: 'uuid' }) playerId!: string;
  @ApiPropertyOptional({ type: VectorDto, nullable: true }) homeSettlement!: VectorDto | null;
}

export class WorldDto {
  @ApiProperty({ example: 'world-1' }) slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['DRAFT', 'OPEN', 'CLOSED', 'ENDED'] }) status!: string;
  @ApiProperty() isTest!: boolean;
  @ApiProperty() seed!: number;
  @ApiProperty({ type: SizeDto }) size!: SizeDto;
  @ApiProperty({ type: VectorDto }) wind!: VectorDto;
  @ApiPropertyOptional({ type: WorldProfileDto, nullable: true }) profile!: WorldProfileDto | null;
  @ApiProperty({ example: '2026-09-14T12:00:00.000Z' }) serverTime!: string;
}

export class JoinWorldDto {
  @ApiPropertyOptional({ example: 'Koralowa', minLength: 1, maxLength: 32, description: 'Domyślnie „Osada”' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 32)
  name?: string;
}
```
`apps/core/src/modules/worlds/join.service.ts`:
```ts
import { randomInt } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { STARTER_PACK, startingBuildings } from '@islanders/domain/balance';
import type { Clock } from '@islanders/domain/time';
import type { PlayerPrincipal } from '../../access/player-request.js';
import { DB, type Db } from '../../infra/db/db.module.js';
import { isUniqueViolation } from '../../infra/db/pg-errors.js';
import { CLOCK } from '../../infra/time/time.module.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfilesRepository } from '../profiles/profiles.repository.js';
import { coordKey } from '../settlements/bbox.js';
import { type OwnSettlementView, ownView } from '../settlements/settlement-views.js';
import { SettlementsRepository } from '../settlements/settlements.repository.js';
import { pickHomeIsland } from './home-island-picker.js';

const JOIN_ATTEMPTS = 3;
const DEFAULT_SETTLEMENT_NAME = 'Osada';

@Injectable()
export class JoinService {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly settlements: SettlementsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Zakłada profil i osadę domową w jednej transakcji; powtarza losowanie po konflikcie klucza osady. */
  async join(world: WorldSettingsRow, player: PlayerPrincipal, name?: string): Promise<OwnSettlementView> {
    if (world.status !== 'OPEN') {
      throw new ConflictException('Świat nie przyjmuje nowych graczy');
    }
    if (await this.profiles.find(player.id)) {
      throw new ConflictException('Masz już profil na tym świecie');
    }
    const settlementName = name ?? DEFAULT_SETTLEMENT_NAME;

    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt++) {
      const taken = await this.settlements.listCoords();
      const pick = pickHomeIsland(world, (x, y) => taken.has(coordKey(x, y)), (n) => randomInt(n));
      if (!pick) {
        throw new ConflictException('Świat jest pełny: brak wolnej wyspy na osadę domową');
      }
      const now = this.clock.now();
      try {
        await this.db.transaction(async (tx) => {
          await this.profiles.create(tx, {
            playerId: player.id,
            nickname: player.nickname,
            homeX: pick.x,
            homeY: pick.y,
          });
          await this.settlements.insertWithBuildings(tx, {
            x: pick.x,
            y: pick.y,
            ownerId: player.id,
            name: settlementName,
            biome: pick.biome,
            resources: STARTER_PACK,
            lastSyncAt: now,
            buildings: startingBuildings(pick.biome),
          });
        });
      } catch (err) {
        // Ktoś wziął tę wyspę w międzyczasie — losujemy jeszcze raz. Współrzędne osady chronią
        // DWA ograniczenia unikalne, więc obie nazwy prowadzą do ponowienia, nie do błędu serwera.
        if (isUniqueViolation(err, 'settlements_pk') || isUniqueViolation(err, 'settlements_xy_biome_unique')) {
          continue;
        }
        if (isUniqueViolation(err, 'profiles_pkey')) {
          throw new ConflictException('Masz już profil na tym świecie');
        }
        if (isUniqueViolation(err, 'profiles_nickname_unique')) {
          throw new ConflictException('Pseudonim jest już zajęty na tym świecie');
        }
        throw err;
      }
      const record = await this.settlements.findOne(pick.x, pick.y);
      if (!record) {
        throw new Error('Osada domowa zniknęła tuż po założeniu');
      }
      return ownView(record, world.slug, now);
    }
    throw new ConflictException('Nie udało się wylosować wolnej wyspy, spróbuj ponownie');
  }
}
```
`apps/core/src/modules/worlds/join.service.spec.ts`:
```ts
import { ConflictException } from '@nestjs/common';
import { STARTER_PACK, startingBuildings } from '@islanders/domain/balance';
import type { Clock } from '@islanders/domain/time';
import { islandAt } from '../../domain/geography/index.js';
import type { Db } from '../../infra/db/db.module.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import type { ProfileRow, ProfilesRepository } from '../profiles/profiles.repository.js';
import type { SettlementRecord } from '../settlements/settlement-views.js';
import type { SettlementsRepository } from '../settlements/settlements.repository.js';
import { JoinService } from './join.service.js';

const PLAYER = { id: '00000000-0000-4000-8000-000000000042', roles: ['player' as const], nickname: 'gracz' };
const world = {
  id: 1, slug: 'world-7', name: 'Świat 7', status: 'OPEN', isTest: false,
  seed: 1337, width: 200, height: 200, windX: 0, windY: 0,
  createdAt: new Date(0), updatedAt: new Date(0),
} as WorldSettingsRow;

/**
 * Drizzle 0.45 opakowuje `PostgresError` w `DrizzleQueryError` i zostawia oryginał pod `cause`,
 * więc atrapa naśladuje ten sam łańcuch, po którym chodzi `isUniqueViolation`.
 */
function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    cause: { code: '23505', constraint_name: constraint },
  });
}

function makeJoinService(failures: { settlement?: (Error | null)[]; profile?: (Error | null)[] } = {}) {
  const profileAttempts: { homeX: number; homeY: number }[] = [];
  const profiles = {
    find: () => Promise.resolve(undefined),
    create: (_client: unknown, input: { homeX: number; homeY: number }) => {
      profileAttempts.push({ homeX: input.homeX, homeY: input.homeY });
      const err = failures.profile?.[profileAttempts.length - 1];
      return err ? Promise.reject(err) : Promise.resolve({} as ProfileRow);
    },
  } as unknown as ProfilesRepository;

  const insertAttempts: { x: number; y: number }[] = [];
  const settlements = {
    listCoords: () => Promise.resolve(new Set<string>()),
    insertWithBuildings: (_client: unknown, input: { x: number; y: number }) => {
      insertAttempts.push({ x: input.x, y: input.y });
      const err = failures.settlement?.[insertAttempts.length - 1];
      return err ? Promise.reject(err) : Promise.resolve();
    },
    findOne: (x: number, y: number) =>
      Promise.resolve({
        x, y, ownerId: PLAYER.id, ownerName: 'gracz', name: 'Osada',
        biome: islandAt(world.seed, x, y)!.biome,
        resources: { ...STARTER_PACK }, population: 0,
        lastSyncAt: new Date('2026-09-14T12:00:00.000Z'),
        buildings: startingBuildings(islandAt(world.seed, x, y)!.biome),
      } satisfies SettlementRecord),
  } as unknown as SettlementsRepository;

  // Atrapa transakcji: uruchamia ciało i przepuszcza jego odrzucenie, tak jak drizzle.
  const db = { transaction: (fn: (tx: unknown) => Promise<void>) => fn({}) } as unknown as Db;
  const clock: Clock = { now: () => new Date('2026-09-14T12:00:00.000Z') };
  return { service: new JoinService(profiles, settlements, db, clock), insertAttempts, profileAttempts };
}

describe('JoinService.join — ponawianie i klasyfikacja błędów bazy', () => {
  it('po konflikcie settlements_pk losuje jeszcze raz i kończy się sukcesem', async () => {
    const { service, insertAttempts, profileAttempts } = makeJoinService({
      settlement: [uniqueViolation('settlements_pk'), null],
    });
    const view = await service.join(world, PLAYER);
    expect(insertAttempts).toHaveLength(2);
    expect(profileAttempts[1]).toEqual({ homeX: insertAttempts[1].x, homeY: insertAttempts[1].y });
    expect(view).toMatchObject({ x: insertAttempts[1].x, world: 'world-7', ownerId: PLAYER.id });
  });

  it('gdy settlements_pk pada za każdym razem, wraca 409 po trzech próbach', async () => {
    const { service, insertAttempts } = makeJoinService({
      settlement: Array.from({ length: 10 }, () => uniqueViolation('settlements_pk')),
    });
    await expect(service.join(world, PLAYER)).rejects.toThrow(/Nie udało się wylosować wolnej wyspy/);
    expect(insertAttempts).toHaveLength(3);
  });

  it('konflikt profiles_pkey to 409 o istniejącym profilu, bez ponawiania', async () => {
    const { service, profileAttempts, insertAttempts } = makeJoinService({
      profile: [uniqueViolation('profiles_pkey')],
    });
    await expect(service.join(world, PLAYER)).rejects.toThrow(/Masz już profil na tym świecie/);
    expect(profileAttempts).toHaveLength(1);
    expect(insertAttempts).toHaveLength(0);
  });

  it('świat inny niż OPEN -> 409 bez dotykania bazy', async () => {
    const { service, profileAttempts } = makeJoinService();
    await expect(service.join({ ...world, status: 'CLOSED' }, PLAYER)).rejects.toBeInstanceOf(ConflictException);
    expect(profileAttempts).toHaveLength(0);
  });

  it('błąd niezwiązany z unikalnością leci dalej, a pętla go nie połyka', async () => {
    const boom = Object.assign(new Error('kolumna nie istnieje'), { cause: { code: '42703' } });
    const { service, insertAttempts } = makeJoinService({ settlement: [boom] });
    await expect(service.join(world, PLAYER)).rejects.toBe(boom);
    expect(insertAttempts).toHaveLength(1);
  });
});
```
`apps/core/src/modules/worlds/world.controller.ts`:
```ts
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentPlayer, CurrentWorld } from '../../access/current.decorators.js';
import type { PlayerPrincipal } from '../../access/player-request.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfilesRepository } from '../profiles/profiles.repository.js';
import { SettlementDto } from '../settlements/settlements.dto.js';
import type { OwnSettlementView } from '../settlements/settlement-views.js';
import { JoinService } from './join.service.js';
import { JoinWorldDto, WorldDto } from './world.dto.js';
import { type WorldView, worldView } from './world-views.js';

@ApiTags('world')
@ApiBearerAuth()
@Controller('v1')
export class WorldController {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly joins: JoinService,
  ) {}

  @Get('world')
  @ApiOkResponse({ type: WorldDto })
  async world(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
  ): Promise<WorldView> {
    return worldView(world, await this.profiles.find(player.id));
  }

  @Post('join')
  @HttpCode(201)
  @ApiCreatedResponse({ type: SettlementDto, description: 'Osada domowa (pełny widok) + serverTime' })
  @ApiConflictResponse({ description: 'Masz już profil, świat nie jest OPEN albo jest pełny' })
  join(
    @CurrentPlayer() player: PlayerPrincipal,
    @CurrentWorld() world: WorldSettingsRow,
    @Body() dto: JoinWorldDto,
  ): Promise<OwnSettlementView> {
    return this.joins.join(world, player, dto.name);
  }
}
```
`apps/core/src/modules/worlds/worlds.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SettlementsModule } from '../settlements/settlements.module.js';
import { JoinService } from './join.service.js';
import { WorldController } from './world.controller.js';

@Module({
  imports: [ProfilesModule, SettlementsModule],
  controllers: [WorldController],
  providers: [JoinService],
  exports: [JoinService],
})
export class WorldsModule {}
```

- [ ] **Step 8: Składanie aplikacji**

`apps/core/src/bootstrap.ts`:
```ts
import type { INestApplication } from '@nestjs/common';
import { configureApp } from '@islanders/platform';
import type { Env } from './infra/config/env.js';

/** Konfiguracja wspólna dla main.ts i testów e2e. Wywołać przed `app.listen`. */
export function configureCoreApp(app: INestApplication, env: Env): void {
  configureApp(app, {
    env,
    swagger: {
      title: 'Islanders World',
      description: 'API jednego świata. Trasy gracza wymagają tokenu wydanego przez usługę auth.',
      tags: ['world', 'settlements', 'fleets'],
      path: 'docs',
    },
  });
}
```
`apps/core/src/app.module.ts` — zastąp całym:
```ts
import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import {
  AllExceptionsFilter,
  AppConfigModule,
  RateLimitModule,
  RedisModule,
  ServerTimeInterceptor,
  TimeModule,
} from '@islanders/platform';
import { AccessModule } from './access/access.module.js';
import type { Env } from './infra/config/env.js';
import { DbModule } from './infra/db/db.module.js';
import { FleetsModule } from './modules/fleets/fleets.module.js';
import { SettlementsModule } from './modules/settlements/settlements.module.js';
import { WorldsModule } from './modules/worlds/worlds.module.js';
import { WorldModule } from './world/world.module.js';

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        DbModule,
        RedisModule,
        TimeModule,
        RateLimitModule,
        WorldModule,
        AccessModule,
        WorldsModule,
        SettlementsModule,
        FleetsModule,
      ],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: ServerTimeInterceptor },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
      ],
    };
  }
}
```
`apps/core/src/main.ts` — zastąp całym:
```ts
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
```
Usuń `apps/core/src/infra/http/http.module.ts` i `apps/core/src/infra/http/configure-app.ts`. Cofnij tymczasowe wyłączenia z Task 2 Step 1.

- [ ] **Step 9: Harness aplikacji testowej**

`apps/core/test/support/test-app.ts` — zastąp całym:
```ts
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import request from 'supertest';
import { inject } from 'vitest';
import type { Clock } from '@islanders/domain/time';
import { CLOCK } from '@islanders/platform';
import { AppModule } from '../../src/app.module.js';
import { configureCoreApp } from '../../src/bootstrap.js';
import { parseEnv } from '../../src/infra/config/env.js';
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
    ...options.env,
  });
  let builder = Test.createTestingModule({ imports: [AppModule.forRoot(env)] });
  if (options.clock) {
    builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
  configureCoreApp(app, env);
  await app.listen(0, '127.0.0.1');
  return {
    app,
    http: () => request(app.getHttpServer()),
    db: app.get<Db>(DB),
    slug,
    fakeAuth,
    databaseUrl,
    close: async () => {
      await app.close();
      if (!options.fakeAuth) await fakeAuth.close();
    },
  };
}
```
`apps/core/test/support/fixtures.ts` — nowy:
```ts
import type { WorldStatus } from '@islanders/contracts';
import { profiles, worldSettings } from '../../src/infra/db/schema/index.js';
import type { TestApp } from './test-app.js';
import { type TestPlayer, bearer } from './tokens.js';

/** POST /v1/join; zwraca ciało odpowiedzi (własna osada domowa + serverTime). */
export async function joinWorld(t: TestApp, player: TestPlayer, name?: string) {
  const res = await t
    .http()
    .post('/v1/join')
    .set('Authorization', bearer(player.token))
    .send(name === undefined ? {} : { name })
    .expect(201);
  return res.body as Record<string, unknown> & { x: number; y: number };
}

export async function setWorldStatus(t: TestApp, status: WorldStatus): Promise<void> {
  await t.db.update(worldSettings).set({ status });
}

/** Profil bez osady — do scenariuszy „profil istnieje, osady brak”. */
export async function insertProfile(
  t: TestApp,
  player: TestPlayer,
  home: { x: number; y: number } | null = null,
): Promise<void> {
  await t.db.insert(profiles).values({
    playerId: player.id,
    nickname: player.nickname,
    homeX: home?.x ?? null,
    homeY: home?.y ?? null,
  });
}
```

- [ ] **Step 10: E2E — świat gracza i dołączanie**

`apps/core/test/world.e2e-spec.ts`:
```ts
import { AUDIENCE } from '@islanders/contracts';
import { FixedClock } from '@islanders/domain/time';
import { islandAt } from '../src/domain/geography/index.js';
import { insertProfile, joinWorld, setWorldStatus } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken, signToolsToken } from './support/tokens.js';

describe('świat gracza (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-14T12:00:00.000Z'));

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  const getWorld = (token?: string) => {
    const req = t.http().get('/v1/world');
    return token === undefined ? req : req.set('Authorization', bearer(token));
  };

  it('bez tokenu, ze złym tokenem, bez sub, z obcym aud i issuer, po wygaśnięciu -> 401', async () => {
    await getWorld().expect(401);
    await getWorld('nie.jwt.token').expect(401);
    await getWorld((await signPlayerToken({ omitSub: true })).token).expect(401);
    await getWorld(await signToolsToken()).expect(401);
    await getWorld((await signPlayerToken({ audience: AUDIENCE.internal })).token).expect(401);
    await getWorld((await signPlayerToken({ issuer: 'https://evil.test' })).token).expect(401);
    await getWorld((await signPlayerToken({ expiresInSeconds: -60 })).token).expect(401);
  });

  it('schemat Bearer pisany małą literą -> 200 (RFC 7235)', async () => {
    const p = await signPlayerToken();
    await t.http().get('/v1/world').set('Authorization', `bearer ${p.token}`).expect(200);
  });

  it('GET /v1/world bez profilu: dane publiczne i profile = null', async () => {
    const p = await signPlayerToken();
    const res = await getWorld(p.token).expect(200);
    expect(res.body).toEqual({
      slug: t.slug,
      name: 'Świat testowy',
      status: 'OPEN',
      isTest: false,
      seed: 1337,
      size: { w: 200, h: 200 },
      wind: { x: 0.3, y: -0.1 },
      profile: null,
      serverTime: '2026-09-14T12:00:00.000Z',
    });
  });

  it('profil bez osady: homeSettlement = null', async () => {
    const p = await signPlayerToken();
    await insertProfile(t, p);
    const res = await getWorld(p.token).expect(200);
    expect(res.body.profile).toEqual({ playerId: p.id, homeSettlement: null });
  });

  it('join zakłada osadę domową na wyspie z jedzeniem, z budynkami i pakietem startowym', async () => {
    const p = await signPlayerToken();
    const body = await joinWorld(t, p, 'Koralowa');
    const island = islandAt(1337, body.x, body.y);
    expect(island).not.toBeNull();
    expect(['TROPICAL', 'TEMPERATE']).toContain(island!.biome);
    expect(body).toMatchObject({
      world: t.slug,
      ownerId: p.id,
      ownerName: p.nickname,
      name: 'Koralowa',
      resources: { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 },
      capacity: 2000,
      population: 0,
      populationMax: 100,
      lastSyncAt: '2026-09-14T12:00:00.000Z',
    });
    expect(body.buildings).toMatchObject({ TOWN_HALL: 1, WAREHOUSE: 1, BARRACKS: 0, SHIPYARD: 0 });
    expect(Object.keys(body.buildings as object)).toHaveLength(6);
    const state = await getWorld(p.token).expect(200);
    expect(state.body.profile).toEqual({ playerId: p.id, homeSettlement: { x: body.x, y: body.y } });
  });

  it('powtórny join -> 409; zła nazwa -> 400; świat CLOSED -> 409', async () => {
    const p = await signPlayerToken();
    await joinWorld(t, p);
    await t.http().post('/v1/join').set('Authorization', bearer(p.token)).send({}).expect(409);
    const q = await signPlayerToken();
    await t.http().post('/v1/join').set('Authorization', bearer(q.token)).send({ name: 'x'.repeat(33) }).expect(400);
    await setWorldStatus(t, 'CLOSED');
    try {
      await t.http().post('/v1/join').set('Authorization', bearer(q.token)).send({}).expect(409);
      await getWorld(q.token).expect(200);
    } finally {
      await setWorldStatus(t, 'OPEN');
    }
  });

  it('świat ENDED jest do odczytu', async () => {
    const p = await signPlayerToken();
    await setWorldStatus(t, 'ENDED');
    try {
      const res = await getWorld(p.token).expect(200);
      expect(res.body.status).toBe('ENDED');
    } finally {
      await setWorldStatus(t, 'OPEN');
    }
  });

  it('dwóch graczy dostaje różne wyspy, obie blisko środka', async () => {
    const a = await joinWorld(t, await signPlayerToken());
    const b = await joinWorld(t, await signPlayerToken());
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
    for (const s of [a, b]) {
      expect(Math.abs(s.x - 100)).toBeLessThan(70);
      expect(Math.abs(s.y - 100)).toBeLessThan(70);
    }
  });
});

describe('świat testowy i DRAFT (e2e)', () => {
  it('świat testowy: gracz bez roli tester -> 403, tester i admin -> 200', async () => {
    const t = await createTestApp({ world: { isTest: true } });
    try {
      await t.http().get('/v1/world').set('Authorization', bearer((await signPlayerToken()).token)).expect(403);
      const tester = await signPlayerToken({ roles: ['player', 'tester'] });
      await t.http().get('/v1/world').set('Authorization', bearer(tester.token)).expect(200);
      const admin = await signPlayerToken({ roles: ['player', 'admin'] });
      await t.http().get('/v1/world').set('Authorization', bearer(admin.token)).expect(200);
    } finally {
      await t.close();
    }
  });

  it('DRAFT: gracz bez roli -> 404 na świecie i dołączeniu; tester widzi świat, ale nie dołączy', async () => {
    const t = await createTestApp({ world: { status: 'DRAFT' } });
    try {
      const p = await signPlayerToken();
      const missing = await t.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(404);
      expect(missing.body.message).toBe('Świat nie istnieje');
      await t.http().post('/v1/join').set('Authorization', bearer(p.token)).send({}).expect(404);
      const tester = await signPlayerToken({ roles: ['player', 'tester'] });
      const res = await t.http().get('/v1/world').set('Authorization', bearer(tester.token)).expect(200);
      expect(res.body.status).toBe('DRAFT');
      await t.http().post('/v1/join').set('Authorization', bearer(tester.token)).send({}).expect(409);
    } finally {
      await t.close();
    }
  });
});
```

- [ ] **Step 11: E2E — JWKS w pamięci i w Redisie**

`apps/core/test/access.e2e-spec.ts`:
```ts
import { Redis } from 'ioredis';
import { inject } from 'vitest';
import { jwksCacheKey } from '../src/access/jwks-provider.js';
import { startFakeAuth } from './support/fake-auth.js';
import { createTestApp } from './support/test-app.js';
import { bearer, otherTestKeys, signPlayerToken, testKeys } from './support/tokens.js';

describe('weryfikacja tokenów przez JWKS (e2e)', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(inject('redisUrl'));
  });
  afterAll(async () => {
    await redis.quit();
  });

  const jwksFetches = (requests: { path: string }[]) =>
    requests.filter((r) => r.path === '/.well-known/jwks.json').length;

  it('po starcie JWKS z auth leży w Redisie świata z TTL około 7 dni', async () => {
    const t = await createTestApp();
    try {
      const raw = await redis.get(jwksCacheKey(t.slug));
      expect(JSON.parse(raw!).keys.map((k: { kid: string }) => k.kid)).toEqual([testKeys.kid]);
      const ttl = await redis.ttl(jwksCacheKey(t.slug));
      expect(ttl).toBeGreaterThan(604_800 - 60);
      expect(ttl).toBeLessThanOrEqual(604_800);
    } finally {
      await t.close();
    }
  });

  it('nieznany kid wymusza jedno pobranie JWKS; po rotacji w auth token nowym kluczem przechodzi', async () => {
    const t = await createTestApp();
    try {
      const rotated = await signPlayerToken({ keys: otherTestKeys });
      const before = jwksFetches(t.fakeAuth.requests);
      t.fakeAuth.setJwks({ keys: [otherTestKeys.publicJwk, testKeys.publicJwk] });
      await t.http().get('/v1/world').set('Authorization', bearer(rotated.token)).expect(200);
      expect(jwksFetches(t.fakeAuth.requests)).toBe(before + 1);
    } finally {
      await t.close();
    }
  });

  it('zalew nieznanymi kid nie bije w auth częściej niż raz na 30 s', async () => {
    const t = await createTestApp();
    try {
      const unknown = await signPlayerToken({ keys: otherTestKeys });
      const before = jwksFetches(t.fakeAuth.requests);
      for (let i = 0; i < 5; i++) {
        await t.http().get('/v1/world').set('Authorization', bearer(unknown.token)).expect(401);
      }
      expect(jwksFetches(t.fakeAuth.requests)).toBe(before + 1);
    } finally {
      await t.close();
    }
  });

  it('bez kluczy w auth i w Redisie trasa gracza -> 503', async () => {
    const t = await createTestApp();
    await t.close();
    // Nowa aplikacja na tej samej bazie, z auth zwracającym pusty zestaw kluczy i bez wpisu w Redisie.
    const emptyAuth = await startFakeAuth({ jwks: { keys: [] } });
    await redis.del(jwksCacheKey(t.slug));
    const u = await createTestApp({ databaseUrl: t.databaseUrl, fakeAuth: emptyAuth, world: { slug: t.slug } });
    try {
      const p = await signPlayerToken();
      const res = await u.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(503);
      expect(res.body.message).toBe('Usługa kont niedostępna');
    } finally {
      await u.close();
      await emptyAuth.close();
    }
  });
});
```
`createTestApp` z `databaseUrl` nie wstawia wiersza świata (świat już istnieje w tej bazie), a `world.slug` ustawia `WORLD_SLUG`.

- [ ] **Step 12: E2E — port osad, flot i warstwy HTTP**

`apps/core/test/settlements.e2e-spec.ts` — zastąp całym:
```ts
import { and, eq } from 'drizzle-orm';
import { startingBuildings } from '@islanders/domain/balance';
import { FixedClock } from '@islanders/domain/time';
import { islandAt } from '../src/domain/geography/index.js';
import { buildings } from '../src/infra/db/schema/index.js';
import { joinWorld } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('settlements (e2e) — reguły informacyjne', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-14T12:00:00.000Z'));

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  const around = (a: { x: number; y: number }, b: { x: number; y: number } = a) =>
    `${Math.max(0, Math.min(a.x, b.x) - 3)},${Math.max(0, Math.min(a.y, b.y) - 3)},${Math.min(199, Math.max(a.x, b.x) + 3)},${Math.min(199, Math.max(a.y, b.y) + 3)}`;
  const list = (token: string, bbox?: string) => {
    const req = t.http().get('/v1/settlements').set('Authorization', bearer(token));
    return bbox === undefined ? req : req.query({ bbox });
  };

  it('bez bbox: tylko własne osady, w pełni', async () => {
    const me = await signPlayerToken();
    const other = await signPlayerToken();
    const mine = await joinWorld(t, me, 'Moja');
    await joinWorld(t, other, 'Cudza');
    const res = await list(me.token).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ x: mine.x, y: mine.y, name: 'Moja', ownerName: me.nickname, world: t.slug });
    expect(res.body[0].resources).toBeDefined();
  });

  it('z bbox: własna z resources, cudza bez klucza resources, obie z ownerName', async () => {
    const me = await signPlayerToken();
    const other = await signPlayerToken();
    const mine = await joinWorld(t, me, 'Moja');
    const theirs = await joinWorld(t, other, 'Cudza');
    const res = await list(me.token, around(mine, theirs)).expect(200);
    const own = res.body.find((s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y);
    const foreign = res.body.find((s: { x: number; y: number }) => s.x === theirs.x && s.y === theirs.y);
    expect(own).toMatchObject({ ownerId: me.id, ownerName: me.nickname });
    expect(own.resources).toBeDefined();
    expect(foreign).toBeDefined();
    expect(foreign.ownerId).toBe(other.id);
    expect(foreign.ownerName).toBe(other.nickname);
    expect('resources' in foreign).toBe(false);
    expect('buildings' in foreign).toBe(false);
  });

  it('w jednym prostokącie budynki trafiają do właściwej osady, a nie do sąsiada', async () => {
    const me = await signPlayerToken();
    const other = await signPlayerToken();
    const mine = await joinWorld(t, me, 'Moja');
    const theirs = await joinWorld(t, other, 'Cudza');
    // Obie osady startują identycznie, więc pomylone przypisanie poziomów byłoby niewidoczne.
    const levelAt = (c: { x: number; y: number }, type: 'BARRACKS' | 'TOWN_HALL', level: number) =>
      t.db.update(buildings).set({ level })
        .where(and(eq(buildings.x, c.x), eq(buildings.y, c.y), eq(buildings.type, type)));
    await levelAt(mine, 'BARRACKS', 5);
    await levelAt(theirs, 'TOWN_HALL', 7);
    const res = await list(me.token, around(mine, theirs)).expect(200);
    const own = res.body.find((s: { x: number; y: number }) => s.x === mine.x && s.y === mine.y);
    expect(own.buildings).toEqual({ ...startingBuildings(islandAt(1337, mine.x, mine.y)!.biome), BARRACKS: 5 });
    expect(own.buildings.TOWN_HALL).toBe(1);
  });

  it('zasoby rosną leniwie bez zapisu: po godzinie odczyt pokazuje produkcję, lastSyncAt = now', async () => {
    const me = await signPlayerToken();
    await joinWorld(t, me);
    clock.advance(3_600_000);
    try {
      const res = await list(me.token).expect(200);
      const s = res.body[0];
      expect(s.resources.food).toBe(1000 + s.productionPerHour.food);
      expect(s.lastSyncAt).toBe(clock.now().toISOString());
    } finally {
      clock.advance(-3_600_000);
    }
  });

  it('bbox > 4096 komórek albo poza mapą -> 400; bez profilu -> 403', async () => {
    const me = await signPlayerToken();
    await joinWorld(t, me);
    await list(me.token, '0,0,64,63').expect(400);
    await list(me.token, '0,0,10,200').expect(400);
    await list((await signPlayerToken()).token).expect(403);
  });
});
```
`apps/core/test/fleets.e2e-spec.ts` — zastąp całym:
```ts
import { fleets } from '../src/infra/db/schema/index.js';
import { joinWorld } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('fleets (e2e)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('widzi własne floty w pełni i cudze ATTACK na swoje osady bez ships/cargo; cudzy TRANSPORT jest niewidoczny', async () => {
    const me = await signPlayerToken();
    const enemy = await signPlayerToken();
    const mine = await joinWorld(t, me);
    const theirs = await joinWorld(t, enemy);
    const departAt = new Date('2026-09-14T12:00:00.000Z');
    const arriveAt = new Date('2026-09-14T12:40:00.000Z');
    const empty = { units: {}, resources: {} };
    await t.db.insert(fleets).values([
      { ownerId: me.id, mission: 'EXPEDITION', fromX: mine.x, fromY: mine.y, toX: mine.x + 3, toY: mine.y + 3, ships: { SLOOP: 4 }, cargo: empty, departAt, arriveAt },
      { ownerId: enemy.id, mission: 'ATTACK', fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y, ships: { GALLEON: 2 }, cargo: { units: { MILITIA: 20 }, resources: {} }, departAt, arriveAt },
      { ownerId: enemy.id, mission: 'TRANSPORT', fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y, ships: { SLOOP: 1 }, cargo: { units: {}, resources: { wood: 10 } }, departAt, arriveAt },
      { ownerId: enemy.id, mission: 'ATTACK', fromX: theirs.x, fromY: theirs.y, toX: mine.x, toY: mine.y, ships: { GALLEON: 1 }, cargo: empty, departAt, arriveAt, resolvedAt: arriveAt },
    ]);

    const res = await t.http().get('/v1/fleets').set('Authorization', bearer(me.token)).expect(200);
    expect(res.body).toHaveLength(2);
    const own = res.body.find((f: { mission: string }) => f.mission === 'EXPEDITION');
    const incoming = res.body.find((f: { mission: string }) => f.mission === 'ATTACK');
    expect(own).toMatchObject({ ownerId: me.id, ownerName: me.nickname, ships: { SLOOP: 4 }, world: t.slug });
    expect(incoming).toEqual({
      id: expect.any(String),
      world: t.slug,
      ownerId: enemy.id,
      ownerName: enemy.nickname,
      mission: 'ATTACK',
      from: { x: theirs.x, y: theirs.y },
      to: { x: mine.x, y: mine.y },
      departAt: '2026-09-14T12:00:00.000Z',
      arriveAt: '2026-09-14T12:40:00.000Z',
    });

    const enemyView = await t.http().get('/v1/fleets').set('Authorization', bearer(enemy.token)).expect(200);
    expect(enemyView.body).toHaveLength(2);
    expect(enemyView.body.every((f: { ships?: unknown }) => f.ships !== undefined)).toBe(true);
  });
});
```
`apps/core/test/http.e2e-spec.ts` — zastąp całym:
```ts
import { randomUUID } from 'node:crypto';
import { FixedClock } from '@islanders/domain/time';
import { joinWorld } from './support/fixtures.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('warstwa HTTP core (e2e)', () => {
  let t: TestApp;
  const clock = new FixedClock(new Date('2026-09-14T12:00:00.000Z'));

  beforeAll(async () => {
    // Limit gracza obniżony do 5, żeby test kolejności strażników nie musiał słać 121 żądań.
    t = await createTestApp({ clock, env: { RATE_LIMIT_SUBJECT_PER_MINUTE: '5' } });
  });
  afterAll(async () => {
    await t.close();
  });

  it('X-Server-Time na każdej odpowiedzi, także 404 i 401; serverTime w obiektach, nie w tablicach', async () => {
    const notFound = await t.http().get('/nie-ma').expect(404);
    expect(notFound.headers['x-server-time']).toBe('2026-09-14T12:00:00.000Z');
    const unauthorized = await t.http().get('/v1/world').expect(401);
    expect(unauthorized.headers['x-server-time']).toBe('2026-09-14T12:00:00.000Z');

    const p = await signPlayerToken();
    const joined = await joinWorld(t, p);
    expect(joined.serverTime).toBe('2026-09-14T12:00:00.000Z');
    const list = await t.http().get('/v1/settlements').set('Authorization', bearer(p.token)).expect(200);
    expect(Array.isArray(list.body)).toBe(true);
  });

  it('koperta błędów Nest dla 400', async () => {
    const p = await signPlayerToken();
    const res = await t.http().post('/v1/join').set('Authorization', bearer(p.token)).send({ name: 42 }).expect(400);
    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  // Pilnuje kolejności strażników w AccessModule: RateLimitGuard musi działać PO PlayerTokenGuard.
  it('trasa gracza limitowana po graczu, nie po adresie', async () => {
    const a = await signPlayerToken();
    const b = await signPlayerToken();
    for (let i = 0; i < 5; i++) {
      await t.http().get('/v1/world').set('Authorization', bearer(a.token)).expect(200);
    }
    const limited = await t.http().get('/v1/world').set('Authorization', bearer(a.token)).expect(429);
    expect(limited.body.message).toMatch(/Za dużo żądań/);
    expect(limited.headers['retry-after']).toBeDefined();
    await t.http().get('/v1/world').set('Authorization', bearer(b.token)).expect(200);
  });

  it('zalew złymi tokenami zużywa sufit po adresie, zanim zadziała strażnik tokenu', async () => {
    const flood = await createTestApp({ env: { RATE_LIMIT_IP_PER_MINUTE: '3' } });
    try {
      for (let i = 0; i < 3; i++) {
        await flood.http().get('/v1/world').set('Authorization', 'Bearer zly.token.jwt').expect(401);
      }
      const limited = await flood.http().get('/v1/world').set('Authorization', 'Bearer zly.token.jwt').expect(429);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      await flood.close();
    }
  });

  it('dwie instancje na tym samym Redisie i prefiksie dzielą kubełek po adresie', async () => {
    const shared = { RATE_LIMIT_IP_PER_MINUTE: '2', RATE_LIMIT_PREFIX: `rl-shared-${randomUUID()}` };
    const one = await createTestApp({ env: shared });
    const two = await createTestApp({ env: shared });
    try {
      await one.http().get('/v1/world').expect(401);
      await two.http().get('/v1/world').expect(401);
      await one.http().get('/v1/world').expect(429);
    } finally {
      await one.close();
      await two.close();
    }
  });

  it('TRUST_PROXY=1: różne X-Forwarded-For to różne kubełki po adresie', async () => {
    const proxied = await createTestApp({ env: { RATE_LIMIT_IP_PER_MINUTE: '1', TRUST_PROXY: '1' } });
    try {
      const hit = (ip: string) => proxied.http().get('/v1/world').set('X-Forwarded-For', ip);
      await hit('203.0.113.1').expect(401);
      await hit('203.0.113.1').expect(429);
      await hit('203.0.113.2').expect(401);
    } finally {
      await proxied.close();
    }
  });

  it('Swagger pod /docs-json przy SWAGGER_ENABLED=true, wyłączony przy false', async () => {
    const on = await createTestApp({ env: { SWAGGER_ENABLED: 'true' } });
    const off = await createTestApp({ env: { SWAGGER_ENABLED: 'false' } });
    try {
      const res = await on.http().get('/docs-json').expect(200);
      expect(res.body.info.title).toBe('Islanders World');
      expect(res.body.paths['/v1/world']).toBeDefined();
      await off.http().get('/docs-json').expect(404);
    } finally {
      await on.close();
      await off.close();
    }
  });
});
```

- [ ] **Step 13: Weryfikacja i commit**

```bash
npm install
npm run build
npm test
npm run test:e2e
npm run lint
grep -rn "worldId\|world_id\|playerId: number\|JWT_SECRET" apps/core/src apps/core/test
```
Expected: suity zielone; ostatni `grep` nie znajduje nic poza komentarzami historycznymi (jeśli coś znajdzie w kodzie, popraw).

```bash
git add -A
git commit -m "Serve a single world from core with JWKS-verified player tokens and /v1 routes"
```

---

### Task 4: Status świata i CLI `world:*`

**Files:**
- Create: `apps/core/src/world/{world-init.service,world-status.service}.ts`
- Create: `apps/core/src/world/world-binding.spec.ts`
- Create: `apps/core/src/cli/{cli.module,world}.ts`
- Create: `apps/core/test/world-cli.e2e-spec.ts`
- Modify: `apps/core/src/world/world.module.ts`, `apps/core/package.json`

**Interfaces:**
- Consumes: Task 1 `planStatusChange`, `StatusChangePlan`; Task 3 `WorldSettingsRepository`, `InitWorldInput`, `assertWorldBinding`, `WorldBindingError`, `createTestDatabase`.
- Produces:
  - `WorldInitService.init(input: InitWorldInput): Promise<WorldSettingsRow>`; `class WorldAlreadyInitializedError extends Error`; `class InvalidWorldInputError extends Error`
  - `WorldStatusService.change(to: WorldStatus, options: { force: boolean }): Promise<{ from: WorldStatus; to: WorldStatus; forced: boolean }>`; `class StatusChangeRejectedError extends Error` z polem `reason`
  - `CliModule.forRoot(env: { DATABASE_URL: string }): DynamicModule`
  - skrypty npm: `world:init`, `world:open`, `world:close`, `world:end`, `world:status`

- [ ] **Step 1: Test weryfikacji startu (failing)**

`apps/core/src/world/world-binding.spec.ts`:
```ts
import { WorldBindingError, assertWorldBinding } from './world-binding.js';
import type { WorldSettingsRepository, WorldSettingsRow } from './world-settings.repository.js';

const repo = (row: Partial<WorldSettingsRow> | undefined) =>
  ({ find: () => Promise.resolve(row) }) as unknown as WorldSettingsRepository;

describe('assertWorldBinding', () => {
  it('brak świata w bazie -> błąd z instrukcją world:init', async () => {
    await expect(assertWorldBinding(repo(undefined), 'world-1')).rejects.toThrow(/world:init/);
  });
  it('slug bazy różny od WORLD_SLUG -> błąd z oboma slugami', async () => {
    const err = await assertWorldBinding(repo({ slug: 'world-2' }), 'world-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorldBindingError);
    expect((err as Error).message).toMatch(/world-2.*world-1/);
  });
  it('zgodny slug -> zwraca wiersz', async () => {
    await expect(assertWorldBinding(repo({ slug: 'world-1' }), 'world-1')).resolves.toMatchObject({ slug: 'world-1' });
  });
});
```
Run: `npm run test -w apps/core -- world-binding` → PASS od razu (funkcja istnieje z Task 3). Ten test domyka brakujące pokrycie i nie jest krokiem RED.

`apps/core/test/world-cli.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import type { INestApplicationContext } from '@nestjs/common';
import { CliModule } from '../src/cli/cli.module.js';
import { WorldAlreadyInitializedError, WorldInitService } from '../src/world/world-init.service.js';
import { StatusChangeRejectedError, WorldStatusService } from '../src/world/world-status.service.js';
import { profiles } from '../src/infra/db/schema/index.js';
import { DB, type Db } from '../src/infra/db/db.module.js';
import { createTestDatabase } from './support/test-db.js';

describe('world:init i zmiany statusu (e2e)', () => {
  let ctx: INestApplicationContext;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CliModule.forRoot({ DATABASE_URL: await createTestDatabase() })],
    }).compile();
    ctx = await moduleRef.init();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const input = { slug: 'world-cli', name: 'Świat CLI', seed: 42, width: 120, height: 80, windX: 0, windY: 0, isTest: false };

  it('init zakłada świat DRAFT; drugi init to błąd; zły slug i wymiary odrzucone', async () => {
    const init = ctx.get(WorldInitService);
    await expect(init.init({ ...input, slug: 'World CLI' })).rejects.toThrow(/slug/);
    await expect(init.init({ ...input, width: 0 })).rejects.toThrow(/width/);
    await expect(init.init({ ...input, seed: 2 ** 31 })).rejects.toThrow(/seed/);
    await expect(init.init(input)).resolves.toMatchObject({ slug: 'world-cli', status: 'DRAFT' });
    await expect(init.init(input)).rejects.toBeInstanceOf(WorldAlreadyInitializedError);
  });

  it('naturalne przejścia bez --force, inne tylko z --force, DRAFT przy profilach zablokowany', async () => {
    const status = ctx.get(WorldStatusService);
    await expect(status.change('OPEN', { force: false })).resolves.toEqual({ from: 'DRAFT', to: 'OPEN', forced: false });
    await expect(status.change('OPEN', { force: true })).rejects.toMatchObject({ reason: 'SAME_STATUS' });
    await expect(status.change('ENDED', { force: false })).rejects.toBeInstanceOf(StatusChangeRejectedError);
    await expect(status.change('CLOSED', { force: false })).resolves.toMatchObject({ to: 'CLOSED', forced: false });
    await expect(status.change('OPEN', { force: true })).resolves.toMatchObject({ to: 'OPEN', forced: true });
    await ctx.get<Db>(DB).insert(profiles).values({ playerId: '00000000-0000-4000-8000-0000000000aa', nickname: 'ktos' });
    await expect(status.change('DRAFT', { force: true })).rejects.toMatchObject({ reason: 'DRAFT_WITH_PROFILES' });
  });
});
```
Run: `npm run test:e2e -w apps/core -- world-cli`
Expected: FAIL (brak `CliModule`, `WorldInitService`, `WorldStatusService`).

- [ ] **Step 2: Serwisy świata**

`apps/core/src/world/world-init.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { worldSlugSchema } from '@islanders/contracts';
import { DB, type Db } from '../infra/db/db.module.js';
import { isUniqueViolation } from '../infra/db/pg-errors.js';
import { type InitWorldInput, WorldSettingsRepository, type WorldSettingsRow } from './world-settings.repository.js';

export class WorldAlreadyInitializedError extends Error {
  constructor(slug: string) {
    super(`Ta baza ma już świat ${slug}`);
    this.name = 'WorldAlreadyInitializedError';
  }
}

export class InvalidWorldInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWorldInputError';
  }
}

@Injectable()
export class WorldInitService {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** Świat powstaje w statusie DRAFT; otwarcie to osobna, świadoma operacja. */
  async init(input: InitWorldInput): Promise<WorldSettingsRow> {
    if (!worldSlugSchema.safeParse(input.slug).success) {
      throw new InvalidWorldInputError('slug: małe litery, cyfry i pojedyncze myślniki, 3–40 znaków');
    }
    if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2_147_483_647) {
      throw new InvalidWorldInputError('seed musi być liczbą całkowitą w [0, 2147483647]');
    }
    for (const [name, value] of [['width', input.width], ['height', input.height]] as const) {
      if (!Number.isInteger(value) || value < 1) {
        throw new InvalidWorldInputError(`${name} musi być dodatnią liczbą całkowitą`);
      }
    }
    if (!Number.isFinite(input.windX) || !Number.isFinite(input.windY)) {
      throw new InvalidWorldInputError('wiatr musi mieć skończone składowe');
    }
    const existing = await this.worlds.find();
    if (existing) throw new WorldAlreadyInitializedError(existing.slug);
    try {
      return await this.worlds.insert(this.db, { ...input, status: 'DRAFT' });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new WorldAlreadyInitializedError((await this.worlds.find())?.slug ?? '?');
      }
      throw err;
    }
  }
}
```
`apps/core/src/world/world-status.service.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { count } from 'drizzle-orm';
import type { Clock } from '@islanders/domain/time';
import { DB, type Db } from '../infra/db/db.module.js';
import { profiles } from '../infra/db/schema/index.js';
import { CLOCK } from '../infra/time/time.module.js';
import { WorldNotInitializedError, WorldSettingsRepository } from './world-settings.repository.js';
import { type WorldStatus, planStatusChange } from './world-status.js';

const REASON_MESSAGES = {
  SAME_STATUS: 'Świat ma już ten status',
  NEEDS_FORCE: 'To przejście wymaga --force',
  DRAFT_WITH_PROFILES: 'Nie można wrócić do DRAFT: świat ma już profile graczy',
} as const;

export class StatusChangeRejectedError extends Error {
  constructor(
    readonly reason: keyof typeof REASON_MESSAGES,
    from: WorldStatus,
    to: WorldStatus,
  ) {
    super(`${REASON_MESSAGES[reason]} (${from} → ${to})`);
    this.name = 'StatusChangeRejectedError';
  }
}

@Injectable()
export class WorldStatusService {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Zmiana statusu pod blokadą wiersza świata, żeby dwa równoległe polecenia nie ominęły reguł. */
  change(to: WorldStatus, options: { force: boolean }): Promise<{ from: WorldStatus; to: WorldStatus; forced: boolean }> {
    return this.db.transaction(async (tx) => {
      const world = await this.worlds.findForUpdate(tx);
      if (!world) throw new WorldNotInitializedError();
      const [{ value }] = await tx.select({ value: count() }).from(profiles);
      const plan = planStatusChange({ from: world.status, to, force: options.force, profileCount: Number(value) });
      if (!plan.ok) throw new StatusChangeRejectedError(plan.reason, world.status, to);
      await this.worlds.setStatus(tx, to, this.clock.now());
      return { from: world.status, to, forced: plan.forced };
    });
  }
}
```
`apps/core/src/world/world.module.ts` — dopisz `WorldInitService` i `WorldStatusService` do `providers` i `exports`.

- [ ] **Step 3: Moduł i skrypt CLI**

`apps/core/src/cli/cli.module.ts`:
```ts
import { DynamicModule, Module } from '@nestjs/common';
import { AppConfigModule, TimeModule } from '@islanders/platform';
import { DbModule } from '../infra/db/db.module.js';
import { WorldModule } from '../world/world.module.js';

/** Kontekst komend technika: baza i świat, bez serwerów HTTP, bez auth i bez prac w tle. */
@Module({})
export class CliModule {
  static forRoot(env: { DATABASE_URL: string }): DynamicModule {
    return {
      module: CliModule,
      imports: [AppConfigModule.forRoot(env), DbModule, TimeModule, WorldModule],
    };
  }
}
```
`apps/core/src/cli/world.ts`:
```ts
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import type { WorldStatus } from '@islanders/contracts';
import { WorldInitService } from '../world/world-init.service.js';
import { WorldSettingsRepository } from '../world/world-settings.repository.js';
import { WorldStatusService } from '../world/world-status.service.js';
import { CliModule } from './cli.module.js';

const USAGE = `Użycie:
  npm run world:init -w apps/core -- --slug <s> --name <n> --seed <int> --width <int> --height <int> [--wind x,y] [--test]
  npm run world:open|world:close|world:end -w apps/core -- [--force]
  npm run world:status -w apps/core`;

const TARGETS: Record<string, WorldStatus> = { open: 'OPEN', close: 'CLOSED', end: 'ENDED' };

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    slug: { type: 'string' },
    name: { type: 'string' },
    seed: { type: 'string' },
    width: { type: 'string' },
    height: { type: 'string' },
    wind: { type: 'string', default: '0,0' },
    test: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const databaseUrl = z.string().regex(/^postgres(ql)?:\/\//).safeParse(process.env.DATABASE_URL);
if (!databaseUrl.success || !['init', 'open', 'close', 'end', 'status'].includes(command ?? '')) {
  console.error(databaseUrl.success ? USAGE : 'Brak poprawnego DATABASE_URL');
  process.exit(2);
}

const app = await NestFactory.createApplicationContext(CliModule.forRoot({ DATABASE_URL: databaseUrl.data }), {
  logger: ['error', 'warn'],
});
try {
  if (command === 'init') {
    const [windX, windY] = values.wind!.split(',').map(Number);
    const world = await app.get(WorldInitService).init({
      slug: values.slug ?? '',
      name: values.name ?? '',
      seed: Number(values.seed),
      width: Number(values.width),
      height: Number(values.height),
      windX,
      windY,
      isTest: values.test ?? false,
    });
    console.log(`Świat ${world.slug} założony w statusie ${world.status}.`);
  } else if (command === 'status') {
    const world = await app.get(WorldSettingsRepository).get();
    console.log(JSON.stringify(world, null, 2));
  } else {
    const result = await app.get(WorldStatusService).change(TARGETS[command!], { force: values.force ?? false });
    if (result.forced) {
      console.warn(`UWAGA: wymuszone przejście ${result.from} → ${result.to}.`);
    }
    console.log(`Status świata: ${result.from} → ${result.to}.`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await app.close();
}
```
`apps/core/package.json` — skrypty:
```json
    "world:init": "nest build && node dist/cli/world.js init",
    "world:open": "nest build && node dist/cli/world.js open",
    "world:close": "nest build && node dist/cli/world.js close",
    "world:end": "nest build && node dist/cli/world.js end",
    "world:status": "nest build && node dist/cli/world.js status",
```
Uwaga: `--name` z polskimi znakami i spacjami przekazuj w cudzysłowie; `parseArgs` dostaje już rozdzielone argumenty.

Run: `npm run test:e2e -w apps/core -- world-cli` → PASS. Sprawdzenie ręczne skryptu: `npm run build -w apps/core && DATABASE_URL=<url bazy testowej lub lokalnej> node apps/core/dist/cli/world.js status` wypisuje błąd „Baza nie ma świata” na pustej bazie (nie uruchamiaj na bazie z danymi, których nie chcesz zmieniać).

- [ ] **Step 4: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Add world:init and world status commands with forced transitions and the draft rule"
```

---

### Task 5: Porty, role procesu, health i szkielet API admina

**Files:**
- Modify: `apps/core/src/infra/config/env.ts` (+ `env.spec.ts`), `apps/core/src/bootstrap.ts`, `apps/core/src/app.module.ts`, `apps/core/src/main.ts`
- Create: `apps/core/src/infra/config/roles.ts` (+ `roles.spec.ts`)
- Create: `apps/core/src/access/tools-token.guard.ts`, `apps/core/src/admin/{admin.controller,admin.module}.ts`
- Modify: `apps/core/test/support/test-app.ts`
- Create: `apps/core/test/ports.e2e-spec.ts`

**Interfaces:**
- Consumes: platform `HealthModule`, `InternalHttpServer`, `listenInternal`, `closeServer`, `portScopeMiddleware`; Task 3 `TokenVerifier`, `ProfilesRepository`, `WorldSettingsRepository`, `createTestApp`.
- Produces:
  - env: `ADMIN_PORT` (domyślnie 3101), `CORE_ROLE` (`all` | `api` | `worker`, domyślnie `all`)
  - `servesPublicApi(env): boolean`, `servesAdminApi(env): boolean`, `runsBackgroundJobs(env): boolean`
  - `ToolsTokenGuard`; `GET /admin/v1/world` → `{ settings: WorldSettingsRow w JSON, profiles: number, settlements: number }` (pole `outbox` dochodzi w Task 6)
  - test: `TestApp.internalHttp()`; `TestApp.http()` rzuca `Error('Rola worker nie ma portu publicznego')` dla `CORE_ROLE=worker`; domyślne `CORE_ROLE=api` w testach (prace w tle włączane jawnie)

- [ ] **Step 1: Role — test (failing) i implementacja**

`apps/core/src/infra/config/roles.spec.ts`:
```ts
import { runsBackgroundJobs, servesAdminApi, servesPublicApi } from './roles.js';

describe('role procesu core', () => {
  it.each([
    ['all', true, true, true],
    ['api', true, true, false],
    ['worker', false, false, true],
  ] as const)('%s: publiczne=%s, admin=%s, tło=%s', (role, pub, admin, bg) => {
    const env = { CORE_ROLE: role };
    expect(servesPublicApi(env)).toBe(pub);
    expect(servesAdminApi(env)).toBe(admin);
    expect(runsBackgroundJobs(env)).toBe(bg);
  });
});
```
`apps/core/src/infra/config/roles.ts`:
```ts
export type CoreRole = 'all' | 'api' | 'worker';
type WithRole = { CORE_ROLE: CoreRole };

/** `worker` nie nasłuchuje na porcie publicznym i nie wystawia API admina — tylko `/health/*`. */
export const servesPublicApi = (env: WithRole): boolean => env.CORE_ROLE !== 'worker';
export const servesAdminApi = (env: WithRole): boolean => env.CORE_ROLE !== 'worker';
/** Zgłoszenie świata i wysyłacz outboxa. */
export const runsBackgroundJobs = (env: WithRole): boolean => env.CORE_ROLE !== 'api';
```
W `apps/core/src/infra/config/env.ts` dopisz do obiektu:
```ts
    ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3101),
    CORE_ROLE: z.enum(['all', 'api', 'worker']).default('all'),
```
W `env.spec.ts` w teście domyślnych dopisz `expect(env.ADMIN_PORT).toBe(3101); expect(env.CORE_ROLE).toBe('all');` oraz test `expect(() => parseEnv({ ...base, CORE_ROLE: 'batch' })).toThrow(/CORE_ROLE/);`.

Run: `npm run test -w apps/core -- roles env` → PASS.

- [ ] **Step 2: E2E portów i ról (failing)**

`apps/core/test/ports.e2e-spec.ts`:
```ts
import { createTestApp } from './support/test-app.js';
import { bearer, signPlayerToken, signToolsToken } from './support/tokens.js';
import { joinWorld } from './support/fixtures.js';

describe('porty i role core (e2e)', () => {
  it('health tylko na porcie wewnętrznym; /admin i /health na publicznym -> 404', async () => {
    const t = await createTestApp();
    try {
      await t.internalHttp().get('/health/live').expect(200);
      const ready = await t.internalHttp().get('/health/ready').expect(200);
      expect(ready.body).toMatchObject({ status: 'ok', db: 'up', redis: 'up' });
      await t.http().get('/health/ready').expect(404);
      await t.http().get('/admin/v1/world').expect(404);
      await t.internalHttp().get('/v1/world').expect(404);
    } finally {
      await t.close();
    }
  });

  it('GET /admin/v1/world: bez tokenu 401, token gracza 401, tools bez admin 403, admin 200', async () => {
    const t = await createTestApp();
    try {
      const p = await signPlayerToken();
      await joinWorld(t, p);
      await t.internalHttp().get('/admin/v1/world').expect(401);
      await t.internalHttp().get('/admin/v1/world').set('Authorization', bearer(p.token)).expect(401);
      await t.internalHttp().get('/admin/v1/world')
        .set('Authorization', bearer(await signToolsToken({ roles: ['player', 'tester'] }))).expect(403);
      const res = await t.internalHttp().get('/admin/v1/world')
        .set('Authorization', bearer(await signToolsToken())).expect(200);
      expect(res.body).toMatchObject({ settings: { slug: t.slug, status: 'OPEN' }, profiles: 1, settlements: 1 });
    } finally {
      await t.close();
    }
  });

  it('rola worker: brak portu publicznego, health działa, API admina nie istnieje', async () => {
    const t = await createTestApp({ env: { CORE_ROLE: 'worker' } });
    try {
      expect(() => t.http()).toThrow(/worker/);
      await t.internalHttp().get('/health/ready').expect(200);
      await t.internalHttp().get('/admin/v1/world')
        .set('Authorization', bearer(await signToolsToken())).expect(404);
    } finally {
      await t.close();
    }
  });
});
```
Run: `npm run test:e2e -w apps/core -- ports` → FAIL.

- [ ] **Step 3: Strażnik tools i API admina**

`apps/core/src/access/tools-token.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TokenVerifier } from './token-verifier.js';

/** API admina: token panelu (`aud: islanders-tools`) z rolą `admin`. */
@Injectable()
export class ToolsTokenGuard implements CanActivate {
  constructor(private readonly verifier: TokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = /^bearer +(.+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException('Brak tokenu');
    const claims = await this.verifier.verify(token, 'tools');
    if (!claims.roles.includes('admin')) {
      throw new ForbiddenException('Wymagana rola admin');
    }
    return true;
  }
}
```
`apps/core/src/admin/admin.controller.ts`:
```ts
import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { count } from 'drizzle-orm';
import { ToolsTokenGuard } from '../access/tools-token.guard.js';
import { DB, type Db } from '../infra/db/db.module.js';
import { settlements } from '../infra/db/schema/index.js';
import { ProfilesRepository } from '../modules/profiles/profiles.repository.js';
import { WorldSettingsRepository, type WorldSettingsRow } from '../world/world-settings.repository.js';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/v1')
@UseGuards(ToolsTokenGuard)
export class AdminController {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    private readonly profiles: ProfilesRepository,
    @Inject(DB) private readonly db: Db,
  ) {}

  @Get('world')
  async world(): Promise<{ settings: WorldSettingsRow; profiles: number; settlements: number }> {
    const [settings, profileCount, [settlementRow]] = await Promise.all([
      this.worlds.get(),
      this.profiles.count(),
      this.db.select({ value: count() }).from(settlements),
    ]);
    return { settings, profiles: profileCount, settlements: Number(settlementRow.value) };
  }
}
```
`apps/core/src/admin/admin.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ToolsTokenGuard } from '../access/tools-token.guard.js';
import { ProfilesModule } from '../modules/profiles/profiles.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [AccessModule, ProfilesModule],
  controllers: [AdminController],
  providers: [ToolsTokenGuard],
})
export class AdminModule {}
```
`AccessModule` jest importowany w `AppModule` i w `AdminModule`; Nest tworzy moduł raz, więc `JwksProvider`, `TokenVerifier` i globalne strażniki istnieją w jednej instancji.

- [ ] **Step 4: Składanie według roli**

`apps/core/src/bootstrap.ts` — po `configureApp(...)` dopisz:
```ts
  // Po configureApp: odpowiedź 404 z zakresu portu też niesie X-Server-Time.
  app.use(portScopeMiddleware({ internalPrefixes: ['/health', '/admin'], sharedPaths: [] }));
```
(import `portScopeMiddleware` z `@islanders/platform`).

`apps/core/src/app.module.ts` — importy dopisz `HealthModule`, `InternalHttpServer` z platform, `AdminModule`, `servesAdminApi`; w `imports` po `FleetsModule` dopisz `HealthModule` oraz `...(servesAdminApi(env) ? [AdminModule] : [])`; w `providers` dopisz `InternalHttpServer`.

`apps/core/src/main.ts` — fragment po `configureCoreApp(app, env);` zastąp:
```ts
  if (servesPublicApi(env)) {
    await app.listen(env.PORT);
  } else {
    await app.init();
  }
  const internal = await listenInternal(app, env.ADMIN_PORT);
  // Zamknięcie serwera wewnętrznego w cyklu życia Nesta (beforeApplicationShutdown), bez własnych sygnałów.
  app.get(InternalHttpServer).attach(internal);
  new Logger('Bootstrap').log(
    `Świat ${world.slug} (${world.status}), rola ${env.CORE_ROLE}: ` +
      `${servesPublicApi(env) ? `publiczny :${env.PORT}, ` : ''}wewnętrzny :${env.ADMIN_PORT}`,
  );
```
(importy: `InternalHttpServer`, `listenInternal` z `@islanders/platform`, `servesPublicApi` z `./infra/config/roles.js`; usuń poprzedni log).

`apps/core/test/support/test-app.ts`:
- import `InternalHttpServer`, `closeServer`, `listenInternal` z `@islanders/platform`, `servesPublicApi` z `../../src/infra/config/roles.js`;
- w `parseEnv({...})` dopisz przed `...options.env`: `CORE_ROLE: 'api',` z komentarzem `// Prace w tle (outbox, zgłoszenie świata) testy włączają jawnie rolą all/worker.`;
- w `TestApp` dodaj `internalHttp: () => ReturnType<typeof request>;`;
- zamiast `await app.listen(0, '127.0.0.1');`:
```ts
  if (servesPublicApi(env)) {
    await app.listen(0, '127.0.0.1');
  } else {
    await app.init();
  }
  const internal = await listenInternal(app, 0, '127.0.0.1');
  app.get(InternalHttpServer).attach(internal);
```
- w zwracanym obiekcie:
```ts
    http: () => {
      if (!servesPublicApi(env)) throw new Error('Rola worker nie ma portu publicznego');
      return request(app.getHttpServer());
    },
    internalHttp: () => request(internal),
```
- w `close`: przed `app.close()` dopisz `await closeServer(internal);`.

Run: `npm run build:packages && npm run test:e2e -w apps/core` → PASS (w tym `ports`).

- [ ] **Step 5: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Split core into public and internal ports with health, an admin skeleton and CORE_ROLE"
```

---

### Task 6: Klient auth, zgłoszenie świata i outbox

**Files:**
- Modify: `apps/core/src/infra/config/env.ts` (+ `env.spec.ts`)
- Create: `apps/core/src/auth-client/{auth-client,auth-client.module}.ts`
- Create: `apps/core/src/outbox/{events,outbox.repository,outbox-repository.module,outbox-dispatcher,world-registrar,outbox-dispatch.module}.ts` (+ `events.spec.ts`)
- Modify: `apps/core/src/modules/worlds/join.service.ts` (+ `join.service.spec.ts`), `apps/core/src/world/world-status.service.ts`, `apps/core/src/admin/admin.controller.ts`, `apps/core/src/cli/{cli.module,world}.ts`, `apps/core/src/app.module.ts`
- Create: `apps/core/test/support/fake-auth-routes.ts`, `apps/core/test/outbox.e2e-spec.ts`
- Modify: `apps/core/test/support/test-app.ts`, `apps/core/test/world-cli.e2e-spec.ts`, `apps/core/test/ports.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 `backoffDelayMs`, `CircuitBreaker`, `CircuitOpenError`; Task 4 `WorldStatusService`; Task 5 `runsBackgroundJobs`; platform `withAdvisoryLock`, `PG_CLIENT`; contracts `eventBatchSchema`, `worldRegistrationSchema`, `WorldEvent`, `WorldRegistration`, `EventBatch`.
- Produces:
  - env: `PUBLIC_URL`, `ADMIN_URL` (URL), `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET` (niepuste)
  - `playerJoinedWorldEvent(slug: string, playerId: string, joinedAt: Date): WorldEvent`, `worldStatusChangedEvent(slug: string, status: WorldStatus, at: Date): WorldEvent`
  - `OutboxRepository`: `add(client: DbClient, event: WorldEvent): Promise<void>`, `dueBatch(now: Date, limit: number): Promise<OutboxRow[]>`, `markSent(ids: string[], now: Date): Promise<void>`, `recordFailure(id: string, attempts: number, nextAttemptAt: Date, error: string): Promise<void>`, `deleteSentBefore(date: Date): Promise<number>`, `stats(): Promise<{ pending: number; oldestPendingAt: Date | null }>`; `OutboxRepositoryModule` (globalny)
  - `AuthClient`: `registerWorld(slug: string, registration: WorldRegistration): Promise<AuthResponse>`, `sendEvents(batch: EventBatch): Promise<AuthResponse>`; `interface AuthResponse { status: number; body: unknown }`; `class AuthUnavailableError extends Error`
  - `OutboxDispatcher`: `dispatchOnce(): Promise<'locked' | 'idle' | 'sent' | 'failed'>`, `isScheduled(): boolean`; stałe `OUTBOX_INTERVAL_MS = 2_000`, `OUTBOX_LOCK_KEY = 72_001`, `OUTBOX_BATCH = 100`, `OUTBOX_RETENTION_MS = 7 * 24 * 3_600_000`, `OUTBOX_STALE_MS = 15 * 60_000`
  - `WorldRegistrar`: `registerOnce(): Promise<boolean>`, `isScheduled(): boolean`
  - `GET /admin/v1/world` dodatkowo `outbox: { pending: number; oldestPendingAt: string | null }`
  - test: `installAuthRoutes(fakeAuth, options?: { eventsStatus?: number; worldsStatus?: number; tokenStatus?: number }): AuthRouteState` z polami `tokenRequests`, `registrations: { slug: string; body: WorldRegistration }[]`, `batches: EventBatch[]` i metodą `set(options)`

- [ ] **Step 1: Zdarzenia — test (failing) i implementacja**

`apps/core/src/outbox/events.spec.ts`:
```ts
import { worldEventSchema } from '@islanders/contracts';
import { playerJoinedWorldEvent, worldStatusChangedEvent } from './events.js';

describe('zdarzenia dla auth', () => {
  const at = new Date('2026-09-14T12:00:00.000Z');

  it('PlayerJoinedWorld spełnia kontrakt', () => {
    const e = playerJoinedWorldEvent('world-1', '00000000-0000-4000-8000-000000000001', at);
    expect(worldEventSchema.parse(e)).toMatchObject({
      type: 'PlayerJoinedWorld', worldSlug: 'world-1', joinedAt: at.toISOString(), occurredAt: at.toISOString(),
    });
  });

  it('WorldStatusChanged spełnia kontrakt, każde zdarzenie ma własny eventId', () => {
    const a = worldStatusChangedEvent('world-1', 'OPEN', at);
    const b = worldStatusChangedEvent('world-1', 'OPEN', at);
    expect(worldEventSchema.parse(a)).toMatchObject({ type: 'WorldStatusChanged', status: 'OPEN' });
    expect(a.eventId).not.toBe(b.eventId);
  });
});
```
`apps/core/src/outbox/events.ts`:
```ts
import { randomUUID } from 'node:crypto';
import type { WorldEvent, WorldStatus } from '@islanders/contracts';

export function playerJoinedWorldEvent(slug: string, playerId: string, joinedAt: Date): WorldEvent {
  return {
    type: 'PlayerJoinedWorld',
    eventId: randomUUID(),
    worldSlug: slug,
    occurredAt: joinedAt.toISOString(),
    playerId,
    joinedAt: joinedAt.toISOString(),
  };
}

export function worldStatusChangedEvent(slug: string, status: WorldStatus, at: Date): WorldEvent {
  return {
    type: 'WorldStatusChanged',
    eventId: randomUUID(),
    worldSlug: slug,
    occurredAt: at.toISOString(),
    status,
  };
}
```
Run: `npm run test -w apps/core -- events` → PASS.

- [ ] **Step 2: Konfiguracja**

`apps/core/src/infra/config/env.ts` — dopisz:
```ts
    PUBLIC_URL: z.url(),
    ADMIN_URL: z.url(),
    AUTH_CLIENT_ID: z.string().min(1),
    AUTH_CLIENT_SECRET: z.string().min(1),
```
`env.spec.ts` — do `base` dopisz `PUBLIC_URL: 'https://world-1.islanders.online'`, `ADMIN_URL: 'http://core-world-1:3101'`, `AUTH_CLIENT_ID: 'core-world-1'`, `AUTH_CLIENT_SECRET: 'sekret'`; dodaj `expect(() => parseEnv({ ...base, AUTH_CLIENT_SECRET: '' })).toThrow(/AUTH_CLIENT_SECRET/);`.

`apps/core/test/support/test-app.ts` — w `parseEnv({...})` przed `...options.env` dopisz:
```ts
    PUBLIC_URL: `https://${slug}.islanders.test`,
    ADMIN_URL: 'http://127.0.0.1:3101',
    AUTH_CLIENT_ID: `core-${slug}`,
    AUTH_CLIENT_SECRET: 'sekret-testowy-core-0123456789abcdef',
```

- [ ] **Step 3: Repozytorium outboxa**

`apps/core/src/outbox/outbox.repository.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, inArray, isNotNull, isNull, lt, min } from 'drizzle-orm';
import type { WorldEvent } from '@islanders/contracts';
import { DB, type Db, type DbClient } from '../infra/db/db.module.js';
import { outbox } from '../infra/db/schema/index.js';

export type OutboxRow = typeof outbox.$inferSelect;

@Injectable()
export class OutboxRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** W transakcji zmiany, która wywołała zdarzenie. */
  async add(client: DbClient, event: WorldEvent): Promise<void> {
    await client.insert(outbox).values({ id: event.eventId, type: event.type, payload: event });
  }

  /**
   * Najstarsze niewysłane zdarzenia, ale tylko gdy najstarsze z nich już może być ponowione:
   * kolejność w obrębie świata ma pierwszeństwo przed przepustowością.
   */
  async dueBatch(now: Date, limit: number): Promise<OutboxRow[]> {
    const rows = await this.db
      .select()
      .from(outbox)
      .where(isNull(outbox.sentAt))
      .orderBy(asc(outbox.createdAt), asc(outbox.id))
      .limit(limit);
    const head = rows[0];
    if (!head || (head.nextAttemptAt && head.nextAttemptAt.getTime() > now.getTime())) return [];
    return rows;
  }

  async markSent(ids: string[], now: Date): Promise<void> {
    if (ids.length === 0) return;
    await this.db.update(outbox).set({ sentAt: now }).where(inArray(outbox.id, ids));
  }

  async recordFailure(id: string, attempts: number, nextAttemptAt: Date, error: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({ attempts, nextAttemptAt, lastError: error.slice(0, 500) })
      .where(inArray(outbox.id, [id]));
  }

  async deleteSentBefore(date: Date): Promise<number> {
    const deleted = await this.db
      .delete(outbox)
      .where(and(isNotNull(outbox.sentAt), lt(outbox.sentAt, date)))
      .returning({ id: outbox.id });
    return deleted.length;
  }

  async stats(): Promise<{ pending: number; oldestPendingAt: Date | null }> {
    const [row] = await this.db
      .select({ pending: count(), oldest: min(outbox.createdAt) })
      .from(outbox)
      .where(isNull(outbox.sentAt));
    return { pending: Number(row.pending), oldestPendingAt: row.oldest ?? null };
  }
}
```
`apps/core/src/outbox/outbox-repository.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository.js';

/** Zapis zdarzeń potrzebny aplikacji i komendom CLI; wysyłka żyje osobno (OutboxDispatchModule). */
@Global()
@Module({ providers: [OutboxRepository], exports: [OutboxRepository] })
export class OutboxRepositoryModule {}
```
Uwaga: `created_at` ma rozdzielczość mikrosekund, a dwa zdarzenia z jednej transakcji mogą dostać ten sam czas — dlatego drugi klucz sortowania `id`. Kolejność zdarzeń z jednej transakcji nie ma znaczenia dla auth.

- [ ] **Step 4: Zapis zdarzeń w dołączaniu i zmianie statusu**

`apps/core/src/modules/worlds/join.service.ts`:
- konstruktor: dopisz `private readonly outbox: OutboxRepository` jako trzeci parametr (przed `@Inject(DB)`); import z `../../outbox/outbox.repository.js` i `playerJoinedWorldEvent` z `../../outbox/events.js`;
- w transakcji po `insertWithBuildings` dopisz:
```ts
          await this.outbox.add(tx, playerJoinedWorldEvent(world.slug, player.id, now));
```
`apps/core/src/modules/worlds/join.service.spec.ts` — w `makeJoinService` dodaj atrapę:
```ts
  const events: unknown[] = [];
  const outbox = { add: (_client: unknown, event: unknown) => (events.push(event), Promise.resolve()) } as unknown as OutboxRepository;
```
konstruktor `new JoinService(profiles, settlements, outbox, db, clock)`, zwracaj też `events`; w pierwszym teście dopisz:
```ts
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'PlayerJoinedWorld', worldSlug: 'world-7', playerId: PLAYER.id });
```
(uwaga: atrapa transakcji nie cofa `events` przy nieudanej próbie — pierwsza próba rzuca na `insertWithBuildings`, zanim dotrze do `outbox.add`, więc liczba zdarzeń to 1).

`apps/core/src/world/world-status.service.ts` — konstruktor: dopisz `private readonly outbox: OutboxRepository`; po `setStatus` w transakcji:
```ts
      await this.outbox.add(tx, worldStatusChangedEvent(world.slug, to, now));
```
(zamień `this.clock.now()` na zmienną `const now = this.clock.now();` użytą w obu wywołaniach).

`apps/core/src/cli/cli.module.ts` — dopisz `OutboxRepositoryModule` do `imports`. `apps/core/src/app.module.ts` — dopisz `OutboxRepositoryModule` do `imports` (przed `WorldsModule`).

`apps/core/test/world-cli.e2e-spec.ts` — w teście przejść po udanym `change('OPEN')` dopisz:
```ts
    const rows = await ctx.get<Db>(DB).select().from(outbox);
    expect(rows.map((r) => r.payload)).toContainEqual(expect.objectContaining({ type: 'WorldStatusChanged', status: 'OPEN', worldSlug: 'world-cli' }));
```
(import `outbox` ze schematu), a po odrzuconej zmianie (`SAME_STATUS`) sprawdź, że liczba wierszy się nie zmieniła.

Run: `npm run test -w apps/core -- join.service && npm run test:e2e -w apps/core -- world-cli world` → PASS.

- [ ] **Step 5: Klient auth**

`apps/core/src/auth-client/auth-client.ts`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { EventBatch, WorldRegistration } from '@islanders/contracts';
import { ENV } from '@islanders/platform';
import type { Env } from '../infra/config/env.js';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

const CALL_TIMEOUT_MS = 2_000;
const TOKEN_RENEW_BEFORE_MS = 60_000;

export interface AuthResponse {
  status: number;
  body: unknown;
}

export class AuthUnavailableError extends Error {
  constructor(message: string) {
    super(`Usługa kont niedostępna: ${message}`);
    this.name = 'AuthUnavailableError';
  }
}

const tokenSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() });

/**
 * Wywołania wewnętrznego API auth po sieci wewnętrznej (ADR 0007): timeout 2 s, token serwisowy
 * trzymany w pamięci, circuit breaker (5 błędów → 30 s przerwy → jedno żądanie próbne).
 */
@Injectable()
export class AuthClient {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly breaker = new CircuitBreaker({ threshold: 5, openMs: 30_000, now: () => Date.now() });

  constructor(@Inject(ENV) private readonly env: Env) {}

  registerWorld(slug: string, registration: WorldRegistration): Promise<AuthResponse> {
    return this.authorized('PUT', `/internal/v1/worlds/${slug}`, registration);
  }

  sendEvents(batch: EventBatch): Promise<AuthResponse> {
    return this.authorized('POST', '/internal/v1/events', batch);
  }

  private async authorized(method: string, path: string, body: unknown): Promise<AuthResponse> {
    const res = await this.call(method, path, body, await this.serviceToken());
    if (res.status !== 401) return res;
    // Token mógł zostać unieważniony rotacją kluczy w auth — jedna próba z nowym.
    this.token = null;
    return this.call(method, path, body, await this.serviceToken());
  }

  private async serviceToken(): Promise<string> {
    if (this.token && this.token.expiresAt - TOKEN_RENEW_BEFORE_MS > Date.now()) {
      return this.token.value;
    }
    const res = await this.call('POST', '/internal/v1/token', {
      clientId: this.env.AUTH_CLIENT_ID,
      clientSecret: this.env.AUTH_CLIENT_SECRET,
    });
    if (res.status !== 200) {
      throw new AuthUnavailableError(`token serwisowy: HTTP ${res.status}`);
    }
    const parsed = tokenSchema.parse(res.body);
    this.token = { value: parsed.accessToken, expiresAt: Date.parse(parsed.expiresAt) };
    return parsed.accessToken;
  }

  private async call(method: string, path: string, body: unknown, token?: string): Promise<AuthResponse> {
    if (!this.breaker.canRequest()) throw new CircuitOpenError();
    let res: Response;
    try {
      res = await fetch(new URL(path, this.env.AUTH_INTERNAL_URL), {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (err) {
      this.breaker.recordFailure();
      throw new AuthUnavailableError(err instanceof Error ? err.message : String(err));
    }
    if (res.status >= 500) this.breaker.recordFailure();
    else this.breaker.recordSuccess();
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  }
}
```
`apps/core/src/auth-client/auth-client.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthClient } from './auth-client.js';

@Module({ providers: [AuthClient], exports: [AuthClient] })
export class AuthClientModule {}
```

- [ ] **Step 6: Trasy fałszywego auth i E2E outboxa (failing)**

`apps/core/test/support/fake-auth-routes.ts`:
```ts
import { eventBatchSchema, worldRegistrationSchema, type EventBatch, type WorldRegistration } from '@islanders/contracts';
import type { FakeAuth } from './fake-auth.js';

export interface AuthRouteOptions {
  tokenStatus?: number;
  worldsStatus?: number;
  eventsStatus?: number;
}

export interface AuthRouteState {
  tokenRequests: number;
  registrations: { slug: string; body: WorldRegistration }[];
  batches: EventBatch[];
  set(options: AuthRouteOptions): void;
}

/**
 * Wewnętrzne trasy auth: token serwisowy, rejestr, zdarzenia. Ciała walidowane schematami z
 * @islanders/contracts — ten sam kontrakt, który sprawdza prawdziwe auth (test kontraktowy).
 */
export function installAuthRoutes(fakeAuth: FakeAuth, initial: AuthRouteOptions = {}): AuthRouteState {
  let options = { tokenStatus: 200, worldsStatus: 204, eventsStatus: 200, ...initial };
  const state: AuthRouteState = {
    tokenRequests: 0,
    registrations: [],
    batches: [],
    set: (next) => {
      options = { ...options, ...next };
    },
  };
  const json = (res: import('node:http').ServerResponse, status: number, body?: unknown) =>
    res.writeHead(status, { 'content-type': 'application/json' }).end(body === undefined ? '' : JSON.stringify(body));

  fakeAuth.addRoute((req, res) => {
    if (req.method !== 'POST' || req.path !== '/internal/v1/token') return false;
    state.tokenRequests += 1;
    if (options.tokenStatus !== 200) return json(res, options.tokenStatus, { statusCode: options.tokenStatus }), true;
    json(res, 200, { accessToken: 'token-serwisowy-testowy', expiresAt: new Date(Date.now() + 300_000).toISOString() });
    return true;
  });
  fakeAuth.addRoute((req, res) => {
    const match = /^\/internal\/v1\/worlds\/([a-z0-9-]+)$/.exec(req.path);
    if (req.method !== 'PUT' || !match) return false;
    const parsed = worldRegistrationSchema.safeParse(req.body);
    if (!parsed.success) return json(res, 400, { statusCode: 400 }), true;
    state.registrations.push({ slug: match[1], body: parsed.data });
    json(res, options.worldsStatus);
    return true;
  });
  fakeAuth.addRoute((req, res) => {
    if (req.method !== 'POST' || req.path !== '/internal/v1/events') return false;
    const parsed = eventBatchSchema.safeParse(req.body);
    if (!parsed.success) return json(res, 400, { statusCode: 400 }), true;
    if (options.eventsStatus === 200) state.batches.push(parsed.data);
    json(res, options.eventsStatus, { accepted: parsed.data.events.length, duplicates: 0 });
    return true;
  });
  return state;
}
```
`apps/core/test/outbox.e2e-spec.ts`:
```ts
import { eq } from 'drizzle-orm';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.js';
import { WorldRegistrar } from '../src/outbox/world-registrar.js';
import { WorldStatusService } from '../src/world/world-status.service.js';
import { outbox } from '../src/infra/db/schema/index.js';
import { startFakeAuth } from './support/fake-auth.js';
import { joinWorld } from './support/fixtures.js';
import { installAuthRoutes } from './support/fake-auth-routes.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { bearer, signPlayerToken, signToolsToken } from './support/tokens.js';

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('warunek nie spełniony w czasie');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('outbox i zgłoszenie świata (e2e)', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  it('dołączenie zapisuje PlayerJoinedWorld, a wysyłacz dostarcza je do auth jednym żądaniem z tokenem serwisowym', async () => {
    const routes = installAuthRoutes(t.fakeAuth);
    const p = await signPlayerToken();
    await joinWorld(t, p);
    expect(await app(t).dispatchOnce()).toBe('sent');
    expect(routes.batches).toHaveLength(1);
    expect(routes.batches[0].events).toEqual([
      expect.objectContaining({ type: 'PlayerJoinedWorld', playerId: p.id, worldSlug: t.slug }),
    ]);
    const [row] = await t.db.select().from(outbox);
    expect(row.sentAt).not.toBeNull();
    expect(await app(t).dispatchOnce()).toBe('idle');
    expect(routes.tokenRequests).toBe(1);
  });

  it('zmiana statusu świata dociera jako WorldStatusChanged', async () => {
    const routes = installAuthRoutes(t.fakeAuth);
    await t.app.get(WorldStatusService).change('CLOSED', { force: false });
    await app(t).dispatchOnce();
    expect(routes.batches[0].events[0]).toMatchObject({ type: 'WorldStatusChanged', status: 'CLOSED' });
  });

  it('409 z auth: próba zapisana z backoffem, kolejne zdarzenia czekają za najstarszym', async () => {
    const routes = installAuthRoutes(t.fakeAuth, { eventsStatus: 409 });
    await joinWorld(t, await signPlayerToken());
    await joinWorld(t, await signPlayerToken());
    expect(await app(t).dispatchOnce()).toBe('failed');
    const rows = await t.db.select().from(outbox).orderBy(outbox.createdAt);
    expect(rows[0]).toMatchObject({ attempts: 1, sentAt: null });
    expect(rows[0].nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    expect(rows[1]).toMatchObject({ attempts: 0, sentAt: null });
    routes.set({ eventsStatus: 200 });
    expect(await app(t).dispatchOnce()).toBe('idle');
    await t.db.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1_000) }).where(eq(outbox.id, rows[0].id));
    expect(await app(t).dispatchOnce()).toBe('sent');
    expect(routes.batches[0].events).toHaveLength(2);
  });

  it('API admina pokazuje zaległości outboxa', async () => {
    installAuthRoutes(t.fakeAuth, { eventsStatus: 503 });
    await joinWorld(t, await signPlayerToken());
    const res = await t.internalHttp().get('/admin/v1/world').set('Authorization', bearer(await signToolsToken())).expect(200);
    expect(res.body.outbox).toMatchObject({ pending: 1, oldestPendingAt: expect.any(String) });
  });

  it('rola api nie planuje prac w tle; rola all zgłasza świat przy starcie i planuje wysyłacz', async () => {
    expect(t.app.get(OutboxDispatcher).isScheduled()).toBe(false);
    expect(t.app.get(WorldRegistrar).isScheduled()).toBe(false);

    const auth = await startFakeAuth();
    const routes = installAuthRoutes(auth);
    const all = await createTestApp({ fakeAuth: auth, env: { CORE_ROLE: 'all' } });
    try {
      await waitFor(() => routes.registrations.length > 0);
      expect(routes.registrations[0]).toEqual({
        slug: all.slug,
        body: { name: 'Świat testowy', publicUrl: `https://${all.slug}.islanders.test`, adminUrl: 'http://127.0.0.1:3101', status: 'OPEN', isTest: false },
      });
      expect(all.app.get(OutboxDispatcher).isScheduled()).toBe(true);
      await joinWorld(all, await signPlayerToken());
      await waitFor(() => routes.batches.length > 0);
    } finally {
      await all.close();
      await auth.close();
    }
  });
});

function app(t: TestApp): OutboxDispatcher {
  return t.app.get(OutboxDispatcher);
}
```
Run: `npm run test:e2e -w apps/core -- outbox` → FAIL.

- [ ] **Step 7: Wysyłacz i zgłoszenie świata**

`apps/core/src/outbox/outbox-dispatcher.ts`:
```ts
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { Sql } from 'postgres';
import type { WorldEvent } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV, PG_CLIENT, withAdvisoryLock } from '@islanders/platform';
import { AuthClient } from '../auth-client/auth-client.js';
import { backoffDelayMs } from '../auth-client/backoff.js';
import type { Env } from '../infra/config/env.js';
import { runsBackgroundJobs } from '../infra/config/roles.js';
import { OutboxRepository } from './outbox.repository.js';

export const OUTBOX_INTERVAL_MS = 2_000;
export const OUTBOX_LOCK_KEY = 72_001;
export const OUTBOX_BATCH = 100;
export const OUTBOX_RETENTION_MS = 7 * 24 * 3_600_000;
export const OUTBOX_STALE_MS = 15 * 60_000;
const STALE_WARNING_EVERY_MS = 60_000;
const CONTRACT_ERRORS = new Set([400, 401, 403]);

/** Wysyła zdarzenia do auth „co najmniej raz”, w kolejności, jedną repliką naraz (ADR 0007). */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastStaleWarning = 0;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly auth: AuthClient,
    @Inject(PG_CLIENT) private readonly sql: Sql,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    if (!runsBackgroundJobs(this.env)) return;
    this.timer = setInterval(() => void this.tick(), OUTBOX_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  isScheduled(): boolean {
    return this.timer !== undefined;
  }

  async dispatchOnce(): Promise<'locked' | 'idle' | 'sent' | 'failed'> {
    const result = await withAdvisoryLock(this.sql, OUTBOX_LOCK_KEY, () => this.dispatchLocked());
    return result.acquired ? result.value : 'locked';
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchOnce();
    } catch (err) {
      this.logger.error('Cykl wysyłacza outboxa nie powiódł się', err instanceof Error ? err.stack : String(err));
    } finally {
      this.running = false;
    }
  }

  private async dispatchLocked(): Promise<'idle' | 'sent' | 'failed'> {
    const now = this.clock.now();
    await this.outbox.deleteSentBefore(new Date(now.getTime() - OUTBOX_RETENTION_MS));
    await this.warnIfStale(now);
    const batch = await this.outbox.dueBatch(now, OUTBOX_BATCH);
    if (batch.length === 0) return 'idle';
    const head = batch[0];
    let status: number | null = null;
    let error: string;
    try {
      const res = await this.auth.sendEvents({ events: batch.map((r) => r.payload as WorldEvent) });
      if (res.status === 200) {
        await this.outbox.markSent(batch.map((r) => r.id), this.clock.now());
        return 'sent';
      }
      status = res.status;
      error = `HTTP ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const attempts = head.attempts + 1;
    const nextAttemptAt = new Date(now.getTime() + backoffDelayMs(attempts, Math.random));
    await this.outbox.recordFailure(head.id, attempts, nextAttemptAt, error);
    const message = `Wysyłka ${batch.length} zdarzeń do auth nieudana (próba ${attempts}): ${error}`;
    if (status !== null && CONTRACT_ERRORS.has(status)) this.logger.error(message);
    else this.logger.warn(message);
    return 'failed';
  }

  private async warnIfStale(now: Date): Promise<void> {
    if (now.getTime() - this.lastStaleWarning < STALE_WARNING_EVERY_MS) return;
    const { oldestPendingAt, pending } = await this.outbox.stats();
    if (oldestPendingAt && now.getTime() - oldestPendingAt.getTime() > OUTBOX_STALE_MS) {
      this.lastStaleWarning = now.getTime();
      this.logger.warn(`Outbox: ${pending} niewysłanych zdarzeń, najstarsze z ${oldestPendingAt.toISOString()}`);
    }
  }
}
```
`apps/core/src/outbox/world-registrar.ts`:
```ts
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV } from '@islanders/platform';
import { AuthClient } from '../auth-client/auth-client.js';
import { backoffDelayMs } from '../auth-client/backoff.js';
import type { Env } from '../infra/config/env.js';
import { runsBackgroundJobs } from '../infra/config/roles.js';
import { WorldSettingsRepository } from '../world/world-settings.repository.js';

/** Zgłasza świat do rejestru auth po starcie; ponawia w tle, nie blokując startu aplikacji. */
@Injectable()
export class WorldRegistrar implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorldRegistrar.name);
  private timer?: NodeJS.Timeout;
  private scheduled = false;
  private stopped = false;

  constructor(
    private readonly auth: AuthClient,
    private readonly worlds: WorldSettingsRepository,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (!runsBackgroundJobs(this.env)) return;
    this.scheduled = true;
    this.schedule(0, 1);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  isScheduled(): boolean {
    return this.scheduled;
  }

  async registerOnce(): Promise<boolean> {
    const world = await this.worlds.get();
    try {
      const res = await this.auth.registerWorld(world.slug, {
        name: world.name,
        publicUrl: this.env.PUBLIC_URL,
        adminUrl: this.env.ADMIN_URL,
        status: world.status,
        isTest: world.isTest,
      });
      if (res.status === 204) return true;
      this.logger.warn(`Zgłoszenie świata ${world.slug} odrzucone: HTTP ${res.status}`);
    } catch (err) {
      this.logger.warn(`Zgłoszenie świata ${world.slug} nieudane: ${err instanceof Error ? err.message : String(err)}`);
    }
    return false;
  }

  private schedule(delayMs: number, attempt: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(async () => {
      if (await this.registerOnce()) return;
      this.schedule(backoffDelayMs(attempt, Math.random), attempt + 1);
    }, delayMs);
    this.timer.unref();
  }
}
```
`apps/core/src/outbox/outbox-dispatch.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AuthClientModule } from '../auth-client/auth-client.module.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';
import { WorldRegistrar } from './world-registrar.js';

@Module({
  imports: [AuthClientModule],
  providers: [OutboxDispatcher, WorldRegistrar],
  exports: [OutboxDispatcher, WorldRegistrar],
})
export class OutboxDispatchModule {}
```
`apps/core/src/app.module.ts` — dopisz `OutboxDispatchModule` do `imports` (na końcu, przed `HealthModule`).

`apps/core/src/admin/admin.controller.ts` — konstruktor: dopisz `private readonly outbox: OutboxRepository`; w `world()` dołącz `this.outbox.stats()` do `Promise.all` i zwróć:
```ts
    return {
      settings,
      profiles: profileCount,
      settlements: Number(settlementRow.value),
      outbox: { pending: outboxStats.pending, oldestPendingAt: outboxStats.oldestPendingAt?.toISOString() ?? null },
    };
```
(typ zwracany rozszerz o `outbox: { pending: number; oldestPendingAt: string | null }`).

`apps/core/src/cli/world.ts` — w gałęzi `status` po wypisaniu świata dopisz:
```ts
    const stats = await app.get(OutboxRepository).stats();
    console.log(`Outbox: ${stats.pending} niewysłanych, najstarsze: ${stats.oldestPendingAt?.toISOString() ?? '—'}`);
```

Run: `npm run build:packages && npm run test:e2e -w apps/core -- outbox ports world-cli` → PASS.

- [ ] **Step 8: Commit**

```bash
npm test && npm run test:e2e && npm run lint
git add -A
git commit -m "Register the world with auth and deliver world events through a transactional outbox"
```

---

### Task 7: Scenariusze awarii, konfiguracja przykładowa i dokumentacja

**Files:**
- Create: `apps/core/test/failure.e2e-spec.ts`
- Rewrite: `apps/core/.env.example`
- Modify: `README.md`, `docs/architecture.md` (§9 zmienne core)

**Interfaces:**
- Consumes: wszystko z Tasków 2–6.
- Produces: brak nowych interfejsów.

- [ ] **Step 1: E2E awarii**

`apps/core/test/failure.e2e-spec.ts`:
```ts
import { eq } from 'drizzle-orm';
import { outbox } from '../src/infra/db/schema/index.js';
import { assertWorldBinding } from '../src/world/world-binding.js';
import { WorldSettingsRepository } from '../src/world/world-settings.repository.js';
import { OutboxDispatcher } from '../src/outbox/outbox-dispatcher.js';
import { installAuthRoutes } from './support/fake-auth-routes.js';
import { joinWorld } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';
import { bearer, signPlayerToken } from './support/tokens.js';

describe('awarie auth (e2e)', () => {
  it('auth leży: gracz z ważnym tokenem gra, ready = 200, zdarzenie czeka i dociera po powrocie auth', async () => {
    const t = await createTestApp();
    const routes = installAuthRoutes(t.fakeAuth);
    try {
      await t.fakeAuth.stop();
      const p = await signPlayerToken();
      await t.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(200);
      await joinWorld(t, p);
      await t.internalHttp().get('/health/ready').expect(200);

      const dispatcher = t.app.get(OutboxDispatcher);
      expect(await dispatcher.dispatchOnce()).toBe('failed');
      const [pending] = await t.db.select().from(outbox);
      expect(pending).toMatchObject({ attempts: 1, sentAt: null });

      await t.fakeAuth.start();
      await t.db.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1_000) }).where(eq(outbox.id, pending.id));
      expect(await dispatcher.dispatchOnce()).toBe('sent');
      expect(routes.batches[0].events[0]).toMatchObject({ type: 'PlayerJoinedWorld', playerId: p.id });
    } finally {
      await t.close();
    }
  });

  it('świeża replika przy wyłączonym auth weryfikuje tokeny kluczami z Redisa świata', async () => {
    const first = await createTestApp();
    const { fakeAuth, databaseUrl, slug } = first;
    await first.close();
    // `close` pierwszej aplikacji zamknął jej fałszywy auth — nowa replika startuje bez auth.
    const replica = await createTestApp({ databaseUrl, world: { slug }, fakeAuth });
    try {
      const p = await signPlayerToken();
      await replica.http().get('/v1/world').set('Authorization', bearer(p.token)).expect(200);
    } finally {
      await replica.close();
    }
  });

  it('start z niezgodnym WORLD_SLUG kończy się błędem powiązania', async () => {
    const t = await createTestApp();
    try {
      await expect(assertWorldBinding(t.app.get(WorldSettingsRepository), 'world-inny')).rejects.toThrow(
        /world-inny/,
      );
    } finally {
      await t.close();
    }
  });
});
```
Uwaga do drugiego testu: `FakeAuth.close()` zatrzymuje serwer, ale obiekt nadal ma swój ostatni port; replika dostaje `AUTH_INTERNAL_URL` na ten port, pod którym nic nie nasłuchuje (odmowa połączenia), więc jej `JwksProvider` musi skorzystać z Redisa. Replika nie jest właścicielem `fakeAuth`, więc jej `close()` nie próbuje go zamykać ponownie.

Run: `npm run build:packages && npm run test:e2e -w apps/core -- failure` → PASS (zachowanie istnieje od Tasków 3 i 6; ten krok dowodzi go testem, nie jest krokiem RED).

- [ ] **Step 2: Konfiguracja przykładowa**

`apps/core/.env.example` — zastąp całym:
```
# Porty: publiczny (world-N.islanders.online) i wewnętrzny (/health, /admin)
PORT=3100
ADMIN_PORT=3101
NODE_ENV=development
# Rola procesu: all | api | worker
CORE_ROLE=all
# Baza i Redis tego świata (docker-compose tworzy islanders_world_1)
DATABASE_URL=postgres://islanders:islanders@localhost:5432/islanders_world_1
REDIS_URL=redis://localhost:6379
# Tożsamość świata — musi zgadzać się ze slugiem zapisanym przez world:init
WORLD_SLUG=world-1
PUBLIC_URL=http://localhost:3100
ADMIN_URL=http://localhost:3101
# Usługa auth: adres wewnętrzny (JWKS, token serwisowy, rejestr, zdarzenia) i wystawca tokenów
AUTH_INTERNAL_URL=http://localhost:3001
AUTH_ISSUER=http://localhost:3000
# Wynik `npm run client:create -w apps/auth -- --world world-1`
AUTH_CLIENT_ID=core-world-1
AUTH_CLIENT_SECRET=
# Repozytorium klienta Godot (test zgodności geografii do etapu 3)
ISLANDERS_CLIENT_DIR=../../../islanders
SWAGGER_ENABLED=true
# Redis świata zasila limiter zapytań
RATE_LIMIT_SUBJECT_PER_MINUTE=120
RATE_LIMIT_IP_PER_MINUTE=600
RATE_LIMIT_PREFIX=rl-world-1
# false | true | liczba przeskoków | lista podsieci po przecinku
TRUST_PROXY=false
```

- [ ] **Step 3: README i architektura**

`README.md` — sekcję „Start lokalny”, część `# core`, zastąp:
```bash
# core (świat world-1)
cp apps/core/.env.example apps/core/.env   # AUTH_CLIENT_SECRET z client:create; wpis do SERVICE_CLIENTS w auth
npm run db:migrate -w apps/core
npm run world:init -w apps/core -- --slug world-1 --name "Świat 1" --seed 1337 --width 200 --height 200 --wind 0.3,-0.1
npm run world:open -w apps/core
npm run start:dev -w apps/core             # publiczny :3100 (/v1), wewnętrzny :3101 (/health, /admin/v1)
```
W sekcji „Układ” zmień opis `apps/core` na: `API jednego świata (NestJS): tokeny z auth przez JWKS, trasy /v1, port wewnętrzny, outbox do auth`. Dopisz sekcję:
````markdown
## Core — komendy technika

```bash
npm run world:init -w apps/core -- --slug <s> --name <n> --seed <int> --width <int> --height <int> [--wind x,y] [--test]
npm run world:open -w apps/core            # DRAFT → OPEN
npm run world:close -w apps/core           # OPEN → CLOSED
npm run world:end -w apps/core             # CLOSED → ENDED
npm run world:open -w apps/core -- --force # przejście spoza naturalnej kolejności (np. CLOSED → OPEN)
npm run world:status -w apps/core          # ustawienia świata i zaległości outboxa
```
Powrót do `DRAFT` jest niemożliwy, gdy świat ma choć jeden profil.
````

`docs/architecture.md` §9 — w linii konfiguracji core dopisz `ADMIN_PORT` i usuń zmienne, których nie ma w `apps/core/src/infra/config/env.ts` (sprawdź zgodność listy z plikiem).

- [ ] **Step 4: Weryfikacja końcowa i commit**

```bash
npm install
npm run build
npm test
npm run test:e2e
npm run test:e2e
npm run lint
grep -rn "api/v1\|world_id\|worldId\|JWT_SECRET\|WORKER_ENABLED" apps/core/src apps/core/test apps/core/.env.example README.md
```
Expected: wszystko zielone dwukrotnie; `grep` nie znajduje nic w kodzie i konfiguracji.

```bash
git add -A
git commit -m "Cover auth outages in core e2e tests and document the single-world setup"
```

---

## Pokrycie specu (samoprzegląd)

| Spec | Zadanie |
|---|---|
| §2.1 `world_settings`, `world:init`, `WORLD_SLUG` tylko weryfikuje | 2, 3 (`assertWorldBinding`), 4 |
| §2.2 JWKS w Redisie świata | 3 (`JwksProvider`, `access.e2e`), 7 (replika bez auth) |
| §2.3 `CORE_ROLE` | 5, 6 (prace w tle według roli) |
| §2.4 `GET /v1/world` bez profilu | 3 |
| §2.5 przejścia statusu, `--force`, DRAFT przy profilach | 1, 4 |
| §2.6 DRAFT niewidoczny dla graczy | 3 (`PlayerTokenGuard`, `world.e2e`) |
| §3 schemat od zera, outbox | 2 |
| §4.1 JWKS: cache, odświeżanie, bramka 30 s, 503 | 3 |
| §4.2 strażnicy: gracz, profil, zapis, tools | 3, 5 |
| §4.3 trasy gracza | 3 |
| §5 porty, role, health, admin | 5, 6 (statystyki outboxa) |
| §6.1 klient auth: token, timeout, circuit breaker | 1, 6 |
| §6.2 zgłoszenie świata | 6 |
| §6.3 outbox: zapis w transakcji, kolejność, backoff, błędy kontraktu, ostrzeżenie, retencja | 1, 6 |
| §7 CLI | 4, 6 (`world:status` z outboxem) |
| §8 konfiguracja | 3, 5, 6, 7 |
| §9 testy jednostkowe, e2e, awarii, kontraktowe | 1–7 |
| §11 dokumentacja | 7 (architektura §4, §5, §6 zaktualizowana już w specu) |

Świadome decyzje planu wobec specu:
- Klucz JWKS w Redisie to `auth:jwks:<WORLD_SLUG>` zamiast `auth:jwks` — slug chroni przed pomyłką przy współdzielonej instancji Redisa i izoluje testy; semantyka bez zmian.
- Pobieranie JWKS nie przechodzi przez circuit breaker klienta auth — ogranicza je bramka 30 s i odświeżanie co godzinę.
- `exp` tokenu sprawdzany wobec czasu rzeczywistego, nie zegara gry (`CLOCK`).
- W testach e2e domyślnie `CORE_ROLE=api`; prace w tle włączane jawnie rolą `all`.
- Każdy plik e2e (i każda aplikacja testowa) dostaje własną bazę sklonowaną z szablonu, bo jeden core obsługuje jeden świat.
- Profile i `ProfileGuard` wydzielone do `modules/profiles`, co likwiduje cykl `WorldsModule ⇄ SettlementsModule` (spec A §15.2).
