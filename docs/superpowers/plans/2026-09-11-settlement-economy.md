# Spec B: ekonomia osady — plan implementacji

> **Status: nieaktualny; etap 5 dostanie nowy plan.** Architektura zmieniona przez `docs/superpowers/specs/2026-09-13-architecture-split-design.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gracz może rozbudowywać budynki i rekrutować wojsko przez kolejki zleceń rozłożone w czasie, z poprawnym naliczaniem zasobów także po restarcie serwera i przy wielu instancjach aplikacji.

**Architecture:** Jedna tabela `settlement_orders` z rozróżnikiem rodzaju obsługuje dwie niezależne kolejki na osadę (budowy i szkolenia). Baza jest źródłem prawdy; zadanie BullMQ to wyłącznie budzik na moment ukończenia, a idempotencję daje `resolved_at` sprawdzane wewnątrz transakcji. Rozstrzyganie jest serwisem przyjmującym identyfikator i zegar, więc testy integracyjne nie czekają na prawdziwe opóźnienia; worker to cienka przejściówka.

**Tech Stack:** Node 24, NestJS 12 (ESM), TypeScript 6, Vitest 4, Drizzle ORM 0.45 + postgres.js, PostgreSQL 17, BullMQ 6.3 + ioredis 6, `@testcontainers/postgresql` 12 i `@testcontainers/redis` 12.

**Spec:** `docs/superpowers/specs/2026-09-11-settlement-economy-design.md`, plus `docs/adr/0002-timed-work-orders-on-a-job-queue.md` i `docs/adr/0003-one-work-order-table-with-a-discriminator.md`. Słownik domeny: `../islanders/CONTEXT.md`.

## Global Constraints

- ESM: `"type": "module"`, importy z rozszerzeniem `.js`, także dla plików `.ts`.
- Wszystkie ścieżki HTTP pod `/api/v1`. Klucze JSON `camelCase`. Identyfikator świata jako **string**, `ownerId` i `playerId` jako liczby, współrzędne jako `{ "x": int, "y": int }`. Listy jako gołe tablice. Znaczniki czasu przez `toISOString()`.
- **Cudza osada nigdy nie ma klucza `resources`.** Nowe pola `garrison`, `orders` i `buildingUpgrades` są prywatne dla właściciela i nie pojawiają się w widoku publicznym.
- W `src/domain/` zero importów z `@nestjs/*`, `drizzle-orm`, `postgres`, `bullmq`, `ioredis`, i zero bezpośredniego odczytu zegara. Jedynym miejscem czytającym zegar systemowy pozostaje `systemClock` w `src/domain/time/clock.ts`.
- **Terminologia:** pozycja w kolejce osady to **zlecenie** (Work Order); wpis w kolejce BullMQ to **zadanie** (job). Nie mieszać.
- **Kolejność, która przesądza o poprawności:** rozstrzygnięcie zlecenia materializuje zasoby **na moment `finish_at`** i **przed** podniesieniem poziomu budynku.
- Stos zamrożony: `@nestjs/*` 12.x, `drizzle-orm` 0.45.x, `bullmq` 6.x, `ioredis` 6.x, `@testcontainers/*` 12.x.
- Kod w TypeScript, komentarze i komunikaty po polsku, identyfikatory po angielsku. Prettier: `singleQuote`, `trailingComma: 'all'`.
- Przed każdym commitem `npm run lint` i `npm run build` przechodzą. Twierdzenie „przechodzi" wymaga wklejonego wyjścia komendy.
- Każdy commit kończy się trailerem, który nakazuje instrukcja atrybucji wykonawcy, plus linią `Claude-Session: https://claude.ai/code/session_01M8dt762nmkn45UizBL11GP`.
- **Standard dowodu odziedziczony ze specu A:** testy nośne (naliczanie odcinkowe, kolejność przemiatania, idempotencja, reguła biomu w zleceniach) wymagają weryfikacji mutacyjnej — postaw mutanta, potwierdź porażkę testu, przywróć kod, wklej oba wyjścia do raportu. Mutanty pojedynczo, nigdy dwa naraz.

## Struktura plików

```
src/
  domain/
    balance/
      balance.ts                  ROZSZERZANY: BASE_COST, BASE_TIME_SECONDS, COST_GROWTH, TIME_GROWTH,
                                  upgradeCost, upgradeSeconds, UNIT_COST, UNIT_SECONDS, UNIT_POPULATION,
                                  recruitCost, recruitSeconds, populationOf
    economy/
      spend.ts                    NOWY: canAfford, subtractCost, addRefund (czyste, z obcięciem)
    orders/
      work-order.ts               NOWY: typy WorkOrder (unia rozróżniana), OrderKind
      queue-projection.ts         NOWY: projectFinishTimes — przewidywane terminy dla kolejki
  infra/
    db/schema/
      enums.ts                    ROZSZERZANY: orderKind, militaryType
      settlement-orders.ts        NOWY
      garrisons.ts                NOWY
      settlements.ts              ZMIENIANY: usunięcie kolumny population
    redis/
      redis.module.ts             NOWY: token REDIS, połączenie ioredis, zamykanie
    queue/
      orders.queue.ts             NOWY: nazwa kolejki, typ ładunku zadania, enqueue po id zlecenia
      orders.worker.ts            NOWY: przejściówka wołająca serwis rozstrzygania
      sweeper.ts                  NOWY: przemiatanie startowe i okresowe, blokada doradcza
    http/
      rate-limit.guard.ts         ZMIENIANY: licznik w Redisie zamiast mapy w pamięci
      configure-app.ts            ZMIENIANY: zaufanie do proxy ze zmiennej środowiskowej
  modules/
    settlements/
      settlement-views.ts         ROZSZERZANY: garrison, orders, buildingUpgrades w ownView
      settlements.repository.ts   ROZSZERZANY: garnizon i zlecenia w odczycie, materializacja z blokadą
      orders.repository.ts        NOWY: wstawianie, anulowanie, przesuwanie pozycji, wyszukiwanie zaległych
      orders.service.ts           NOWY: zakolejkowanie rozbudowy i rekrutacji, anulowanie
      order-resolver.service.ts   NOWY: rozstrzyganie jednego zlecenia (serce specu)
      settlements.controller.ts   ROZSZERZANY: trzy nowe trasy
      settlements.dto.ts          ROZSZERZANY: RecruitDto, pola odpowiedzi
drizzle/                          NOWE migracje 0003 i 0004
test/
  support/global-setup.ts         ZMIENIANY: drugi kontener (Redis)
  support/test-app.ts             ZMIENIANY: adres Redisa w env
  support/fixtures.ts             ROZSZERZANY: queueUpgrade, queueRecruit, cancelOrder
  orders.e2e-spec.ts              NOWY
  orders-resolution.e2e-spec.ts   NOWY: testy integracyjne rozstrzygania (bez HTTP)
```

---

## Task 1: Redis w aplikacji i w harnessie testowym

**Files:**
- Create: `src/infra/redis/redis.module.ts`
- Modify: `package.json`, `src/infra/config/env.ts`, `src/app.module.ts`, `test/support/global-setup.ts`, `test/support/vitest.d.ts`, `test/support/test-app.ts`
- Test: `test/health.e2e-spec.ts` (rozszerzany)

**Interfaces:**
- Produces: token `REDIS`, typ `RedisClient` (alias `Redis` z `ioredis`), `RedisModule` (globalny, zamyka połączenie przy wyłączaniu). W `Env` dochodzą `SWEEP_INTERVAL_MS` (domyślnie `60000`), `WORKER_ENABLED` (domyślnie `true`), `TRUST_PROXY` (domyślnie `false`). W testach e2e `inject('redisUrl')`.

- [ ] **Step 1: Zainstaluj zależności**

```bash
npm install bullmq@^6 ioredis@^6
npm install -D @testcontainers/redis@^12
```

Oczekiwane: brak `ERESOLVE`. `ioredis` 6 spełnia peer dependency BullMQ (`>=5.0.0`).

- [ ] **Step 2: Napisz test rozszerzający health o Redis**

W `test/health.e2e-spec.ts`, w teście `GET /api/v1/health -> 200`, dopisz asercję:

```ts
    expect(res.body.redis).toBe('up');
```

- [ ] **Step 3: Uruchom i potwierdź porażkę**

Run: `npm run test:e2e -- test/health.e2e-spec.ts`
Expected: FAIL — `expected undefined to be 'up'`.

- [ ] **Step 4: Dodaj trzy zmienne do schematu env**

W `src/infra/config/env.ts`, w obiekcie `envSchema`, obok istniejących:

```ts
    SWEEP_INTERVAL_MS: z.coerce.number().int().min(1000).default(60_000),
    WORKER_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
```

W `.env.example` dopisz z komentarzem po polsku:

```dotenv
# Co ile milisekund przemiatać zaległe zlecenia (obok przemiatania przy starcie)
SWEEP_INTERVAL_MS=60000
# Czy ten proces ma uruchamiać workera kolejki zleceń
WORKER_ENABLED=true
# Włącz, gdy aplikacja stoi za odwrotnym proxy — inaczej limit po adresie staje się globalny
TRUST_PROXY=false
```

- [ ] **Step 5: Napisz `RedisModule`**

`src/infra/redis/redis.module.ts`:

```ts
import {
  Global,
  Inject,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export const REDIS = Symbol('REDIS');
export type RedisClient = Redis;

@Injectable()
class RedisShutdown implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: RedisClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      // maxRetriesPerRequest musi być null, bo tego wymaga BullMQ od połączenia,
      // którego używa jako blokującego czytnika kolejki.
      useFactory: (env: Env): RedisClient =>
        new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
```

W `src/app.module.ts` dodaj `RedisModule` do `imports`, zaraz po `DbModule`.

- [ ] **Step 6: Rozszerz health o ping Redisa**

W `src/modules/health/health.controller.ts` wstrzyknij `@Inject(REDIS) private readonly redis: RedisClient` i rozszerz metodę:

```ts
  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up'; redis: 'up' }> {
    try {
      await this.db.execute(sql`SELECT 1`);
    } catch (err) {
      this.logger.error(
        'Baza niedostępna',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({ status: 'down', db: 'down' });
    }
    try {
      await this.redis.ping();
    } catch (err) {
      this.logger.error(
        'Redis niedostępny',
        err instanceof Error ? err.stack : String(err),
      );
      throw new ServiceUnavailableException({ status: 'down', redis: 'down' });
    }
    return { status: 'ok', db: 'up', redis: 'up' };
  }
```

- [ ] **Step 7: Dołóż kontener Redisa do harnessu**

`test/support/vitest.d.ts` — dopisz do `ProvidedContext`:

```ts
    redisUrl: string;
```

`test/support/global-setup.ts` — obok kontenera Postgresa:

```ts
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';

let redis: StartedRedisContainer | undefined;
```

w `setup`, po starcie Postgresa:

```ts
  redis = await new RedisContainer('redis:7-alpine').start();
  project.provide('redisUrl', redis.getConnectionUrl());
```

w `teardown`, obok zatrzymania Postgresa:

```ts
  await redis?.stop();
```

`test/support/test-app.ts` — w obiekcie przekazywanym do `parseEnv` dopisz:

```ts
    REDIS_URL: inject('redisUrl'),
    // Worker wyłączony domyślnie: testy integracyjne wołają serwis rozstrzygania wprost,
    // a pojedynczy test e2e włącza go jawnie, żeby udowodnić, że przejściówka jest podpięta.
    WORKER_ENABLED: 'false',
```

- [ ] **Step 8: Uruchom testy**

Run: `npm run test:e2e`
Expected: PASS, wszystkie istniejące pliki plus rozszerzony health.

- [ ] **Step 9: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add Redis connection, health ping and a Redis container in the e2e harness"
```

---

## Task 2: Migracja schematu — zlecenia, garnizon, usunięcie kolumny populacji

**Files:**
- Create: `src/infra/db/schema/settlement-orders.ts`, `src/infra/db/schema/garrisons.ts`, `drizzle/0003_*.sql`
- Modify: `src/infra/db/schema/enums.ts`, `src/infra/db/schema/settlements.ts`, `src/infra/db/schema/index.ts`
- Test: `test/schema.e2e-spec.ts` (rozszerzany)

**Interfaces:**
- Produces: enumy `orderKind` (`BUILD`, `RECRUIT`) i `militaryType` (`SETTLER`, `MILITIA`, `SLOOP`, `GALLEON`); tabele `settlementOrders` i `garrisons`; typy `SettlementOrderRow = typeof settlementOrders.$inferSelect`, `GarrisonRow`. Nazwy ograniczeń, na których stoją późniejsze zadania: `settlement_orders_pk`, `settlement_orders_settlement_biome_fk`, `settlement_orders_biome_type_fk`, `settlement_orders_payload_check`, `garrisons_pk`.

- [ ] **Step 1: Napisz test schematu**

Dopisz do `test/schema.e2e-spec.ts`:

```ts
  it('zlecenie rozbudowy niezgodne z biomem odbija się o klucz obcy', async () => {
    const [world] = await db
      .insert(worlds)
      .values({ seed: 1337, width: 200, height: 200 })
      .returning();
    const [player] = await db
      .insert(players)
      .values({
        email: `ord-${Date.now()}@test.local`,
        nickname: `ord${Date.now()}`,
        passwordHash: 'x',
      })
      .returning();
    const base = { worldId: world.id, x: 11, y: 11 };
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

    // SAWMILL nie istnieje w biomie VOLCANIC — para (biome, building_type)
    // nie ma odpowiednika w biome_buildings.
    await expect(
      db.insert(settlementOrders).values({
        ...base,
        kind: 'BUILD',
        position: 0,
        biome: 'VOLCANIC',
        buildingType: 'SAWMILL',
        targetLevel: 1,
        costWood: 0,
        costStone: 0,
        costFood: 0,
        costIron: 0,
        costSulfur: 0,
      }),
    ).rejects.toMatchObject({
      cause: { code: '23503', constraint_name: 'settlement_orders_biome_type_fk' },
    });

    // Biom w zleceniu musi być biomem osady.
    await expect(
      db.insert(settlementOrders).values({
        ...base,
        kind: 'BUILD',
        position: 0,
        biome: 'TROPICAL',
        buildingType: 'SAWMILL',
        targetLevel: 1,
        costWood: 0,
        costStone: 0,
        costFood: 0,
        costIron: 0,
        costSulfur: 0,
      }),
    ).rejects.toMatchObject({
      cause: {
        code: '23503',
        constraint_name: 'settlement_orders_settlement_biome_fk',
      },
    });

    // Poprawne zlecenie przechodzi.
    await expect(
      db.insert(settlementOrders).values({
        ...base,
        kind: 'BUILD',
        position: 0,
        biome: 'VOLCANIC',
        buildingType: 'IRON_MINE',
        targetLevel: 2,
        costWood: 10,
        costStone: 10,
        costFood: 0,
        costIron: 0,
        costSulfur: 0,
      }),
    ).resolves.toBeDefined();
  });

  it('CHECK odrzuca zlecenie z pomieszanym ładunkiem', async () => {
    const [world] = await db
      .insert(worlds)
      .values({ seed: 1337, width: 200, height: 200 })
      .returning();
    const [player] = await db
      .insert(players)
      .values({
        email: `mix-${Date.now()}@test.local`,
        nickname: `mix${Date.now()}`,
        passwordHash: 'x',
      })
      .returning();
    const base = { worldId: world.id, x: 12, y: 12 };
    await db.insert(settlements).values({
      ...base,
      ownerId: player.id,
      name: 'Mieszana',
      biome: 'TROPICAL',
      wood: 0,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
      lastSyncAt: new Date(),
    });

    // RECRUIT z wypełnionym ładunkiem budowlanym.
    await expect(
      db.insert(settlementOrders).values({
        ...base,
        kind: 'RECRUIT',
        position: 0,
        biome: 'TROPICAL',
        buildingType: 'SAWMILL',
        targetLevel: 2,
        militaryType: 'MILITIA',
        count: 1,
        costWood: 0,
        costStone: 0,
        costFood: 0,
        costIron: 0,
        costSulfur: 0,
      }),
    ).rejects.toMatchObject({
      cause: { code: '23514', constraint_name: 'settlement_orders_payload_check' },
    });
  });
```

Dodaj `settlementOrders` do importów w tym pliku.

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npm run test:e2e -- test/schema.e2e-spec.ts`
Expected: FAIL — brak eksportu `settlementOrders`.

- [ ] **Step 3: Dodaj dwa enumy**

W `src/infra/db/schema/enums.ts`:

```ts
export const orderKind = pgEnum('order_kind', ['BUILD', 'RECRUIT']);
export const militaryType = pgEnum('military_type', [
  'SETTLER',
  'MILITIA',
  'SLOOP',
  'GALLEON',
]);
```

- [ ] **Step 4: Napisz tabelę zleceń**

`src/infra/db/schema/settlement-orders.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { biomeBuildings } from './buildings.js';
import { biomeType, buildingType, militaryType, orderKind } from './enums.js';
import { settlements } from './settlements.js';

const cost = (name: string) =>
  numeric(name, { precision: 14, scale: 4, mode: 'number' }).notNull();

/**
 * Zlecenie (Work Order) — pozycja w kolejce osady. Jedna tabela obsługuje dwie
 * niezależne kolejki: `position` numeruje się w obrębie `kind`, więc budowa
 * i szkolenie biegną równolegle (ADR 0003).
 */
export const settlementOrders = pgTable(
  'settlement_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: integer('world_id').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    kind: orderKind('kind').notNull(),
    position: integer('position').notNull(),
    /** Wypełniony wyłącznie dla BUILD; nośnik reguły biomu z ADR 0001. */
    biome: biomeType('biome'),
    buildingType: buildingType('building_type'),
    targetLevel: integer('target_level'),
    militaryType: militaryType('military_type'),
    count: integer('count'),
    costWood: cost('cost_wood'),
    costStone: cost('cost_stone'),
    costFood: cost('cost_food'),
    costIron: cost('cost_iron'),
    costSulfur: cost('cost_sulfur'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishAt: timestamp('finish_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'settlement_orders_settlement_fk',
      columns: [t.worldId, t.x, t.y],
      foreignColumns: [settlements.worldId, settlements.x, settlements.y],
    }).onDelete('cascade'),
    // Biom w zleceniu nie może kłamać o biomie osady (ADR 0001, ta sama para co buildings).
    foreignKey({
      name: 'settlement_orders_settlement_biome_fk',
      columns: [t.worldId, t.x, t.y, t.biome],
      foreignColumns: [
        settlements.worldId,
        settlements.x,
        settlements.y,
        settlements.biome,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'settlement_orders_biome_type_fk',
      columns: [t.biome, t.buildingType],
      foreignColumns: [biomeBuildings.biome, biomeBuildings.type],
    }),
    check(
      'settlement_orders_payload_check',
      sql`(${t.kind} = 'BUILD'
             AND ${t.biome} IS NOT NULL AND ${t.buildingType} IS NOT NULL
             AND ${t.targetLevel} IS NOT NULL AND ${t.targetLevel} >= 1
             AND ${t.militaryType} IS NULL AND ${t.count} IS NULL)
        OR (${t.kind} = 'RECRUIT'
             AND ${t.militaryType} IS NOT NULL AND ${t.count} IS NOT NULL AND ${t.count} >= 1
             AND ${t.biome} IS NULL AND ${t.buildingType} IS NULL AND ${t.targetLevel} IS NULL)`,
    ),
    index('settlement_orders_queue_idx').on(t.worldId, t.x, t.y, t.kind, t.position),
    index('settlement_orders_pending_idx')
      .on(t.finishAt)
      .where(sql`${t.resolvedAt} IS NULL`),
  ],
);
```

- [ ] **Step 5: Napisz tabelę garnizonu**

`src/infra/db/schema/garrisons.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { militaryType } from './enums.js';
import { settlements } from './settlements.js';

/** Ten sam kształt co `buildings` — spec C przeniesie jednostki do flot tym samym wzorcem. */
export const garrisons = pgTable(
  'garrisons',
  {
    worldId: integer('world_id').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    type: militaryType('type').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ name: 'garrisons_pk', columns: [t.worldId, t.x, t.y, t.type] }),
    foreignKey({
      name: 'garrisons_settlement_fk',
      columns: [t.worldId, t.x, t.y],
      foreignColumns: [settlements.worldId, settlements.x, settlements.y],
    }).onDelete('cascade'),
    check('garrisons_count_nonnegative', sql`${t.count} >= 0`),
  ],
);
```

- [ ] **Step 6: Usuń kolumnę populacji i podłącz eksporty**

W `src/infra/db/schema/settlements.ts` usuń linię `population: integer('population').notNull().default(0),`. W `src/infra/db/schema/index.ts` dopisz:

```ts
export * from './settlement-orders.js';
export * from './garrisons.js';
```

Usunięcie kolumny zepsuje kompilację w `src/modules/settlements/settlements.repository.ts` (wybiera `population`) i w `settlement-views.ts`. **Nie naprawiaj tego tutaj** — Task 6 przepisuje oba pliki. Żeby dowieźć to zadanie z przechodzącym buildem, tymczasowo zwróć w repozytorium `population: 0` jako stałą z komentarzem `// TYMCZASOWE: Task 6 zastępuje to wyliczeniem z garnizonu i kolejki.`

- [ ] **Step 7: Wygeneruj migrację**

```bash
npx drizzle-kit generate --name orders_garrisons_population
```

Sprawdź, że `drizzle/0003_orders_garrisons_population.sql` zawiera: `CREATE TYPE "public"."order_kind"`, `CREATE TYPE "public"."military_type"`, `CREATE TABLE "settlement_orders"`, `CREATE TABLE "garrisons"`, `ALTER TABLE "settlements" DROP COLUMN "population"`, oraz wszystkie pięć nazw ograniczeń z bloku **Interfaces**. Jeśli którejś brakuje, zgłoś to zamiast poprawiać SQL ręcznie.

- [ ] **Step 8: Uruchom testy**

Run: `npm run test:e2e`
Expected: PASS, w tym dwa nowe testy schematu.

- [ ] **Step 9: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add work order and garrison tables, drop the stored population column"
```

---

## Task 3: Balans rozbudowy i rekrutacji, czyste funkcje wydawania

**Files:**
- Modify: `src/domain/balance/balance.ts`, `src/domain/balance/balance.spec.ts`
- Create: `src/domain/economy/spend.ts`, `src/domain/economy/spend.spec.ts`
- Modify: `src/domain/economy/index.ts`

**Interfaces:**
- Consumes: `Resources`, `Building`, `BuildingLevels`, `emptyResources`, `RESOURCES` z `domain/rules`.
- Produces:
  - `COST_GROWTH = 1.6`, `TIME_GROWTH = 1.5`
  - `BASE_COST: Record<Building, Resources>`, `BASE_TIME_SECONDS: Record<Building, number>`
  - `upgradeCost(building: Building, targetLevel: number): Resources` — zaokrąglone w górę
  - `upgradeSeconds(building: Building, targetLevel: number): number` — zaokrąglone w górę
  - `MilitaryType = 'SETTLER' | 'MILITIA' | 'SLOOP' | 'GALLEON'`, `MILITARY_TYPES` jako `as const`
  - `UNIT_COST: Record<MilitaryType, Resources>`, `UNIT_SECONDS: Record<MilitaryType, number>`, `UNIT_POPULATION: Record<MilitaryType, number>`, `UNIT_BUILDING: Record<MilitaryType, Building>`
  - `recruitCost(type, count): Resources`, `recruitSeconds(type, count): number`
  - `populationOf(counts: Partial<Record<MilitaryType, number>>): number`
  - `canAfford(stock: Resources, cost: Resources): boolean`
  - `missingFor(stock: Resources, cost: Resources): Resources` — ile brakuje, zera gdzie starcza
  - `subtractCost(stock: Resources, cost: Resources): Resources`
  - `addRefund(stock: Resources, refund: Resources, capacity: number): { resources: Resources; lost: Resources }`

- [ ] **Step 1: Napisz testy balansu**

Dopisz do `src/domain/balance/balance.spec.ts`:

```ts
describe('koszt i czas rozbudowy', () => {
  it('poziom pierwszy to koszt bazowy bez mnożnika', () => {
    expect(upgradeCost('SAWMILL', 1)).toEqual({
      wood: 60,
      stone: 40,
      food: 0,
      iron: 0,
      sulfur: 0,
    });
    expect(upgradeSeconds('SAWMILL', 1)).toBe(300);
  });

  it('każdy kolejny poziom mnoży przez współczynnik wzrostu i zaokrągla w górę', () => {
    // 60 * 1.6 = 96, 40 * 1.6 = 64, 300 * 1.5 = 450
    expect(upgradeCost('SAWMILL', 2)).toEqual({
      wood: 96,
      stone: 64,
      food: 0,
      iron: 0,
      sulfur: 0,
    });
    expect(upgradeSeconds('SAWMILL', 2)).toBe(450);
    // 60 * 1.6^9 = 4132.07... -> 4133
    expect(upgradeCost('SAWMILL', 10).wood).toBe(
      Math.ceil(60 * COST_GROWTH ** 9),
    );
  });

  it('żaden budynek nie kosztuje jedzenia', () => {
    for (const b of BUILDINGS) {
      expect(BASE_COST[b].food).toBe(0);
    }
  });

  it('koszt i czas rosną ściśle monotonicznie', () => {
    for (const b of BUILDINGS) {
      expect(upgradeSeconds(b, 3)).toBeGreaterThan(upgradeSeconds(b, 2));
      expect(upgradeCost(b, 3).wood).toBeGreaterThanOrEqual(
        upgradeCost(b, 2).wood,
      );
    }
  });
});

describe('rekrutacja', () => {
  it('koszt i czas są liniowe od liczby sztuk, bez rabatu', () => {
    const one = recruitCost('MILITIA', 1);
    const five = recruitCost('MILITIA', 5);
    for (const r of RESOURCES) expect(five[r]).toBe(one[r] * 5);
    expect(recruitSeconds('MILITIA', 5)).toBe(recruitSeconds('MILITIA', 1) * 5);
  });

  it('każdy typ ma budynek, miejsca w populacji i dodatni czas', () => {
    for (const t of MILITARY_TYPES) {
      expect(UNIT_BUILDING[t]).toBeDefined();
      expect(UNIT_POPULATION[t]).toBeGreaterThan(0);
      expect(UNIT_SECONDS[t]).toBeGreaterThan(0);
    }
  });

  it('populacja sumuje miejsca po typach, brak klucza liczy się jak zero', () => {
    expect(populationOf({ MILITIA: 3, SLOOP: 2 })).toBe(
      3 * UNIT_POPULATION.MILITIA + 2 * UNIT_POPULATION.SLOOP,
    );
    expect(populationOf({})).toBe(0);
  });
});
```

Dopisz brakujące importy (`upgradeCost`, `upgradeSeconds`, `COST_GROWTH`, `BASE_COST`, `recruitCost`, `recruitSeconds`, `MILITARY_TYPES`, `UNIT_BUILDING`, `UNIT_POPULATION`, `UNIT_SECONDS`, `populationOf`, `BUILDINGS`, `RESOURCES`).

- [ ] **Step 2: Napisz testy wydawania zasobów**

`src/domain/economy/spend.spec.ts`:

```ts
import { addRefund, canAfford, missingFor, subtractCost } from './spend.js';

const stock = { wood: 100, stone: 50, food: 0, iron: 10, sulfur: 0 };

describe('canAfford', () => {
  it('starcza dokładnie', () => {
    expect(canAfford(stock, { ...stock })).toBe(true);
  });

  it('nie starcza, gdy brakuje choć jednego zasobu', () => {
    expect(
      canAfford(stock, { wood: 100, stone: 51, food: 0, iron: 0, sulfur: 0 }),
    ).toBe(false);
  });
});

describe('missingFor', () => {
  it('podaje niedobór tylko tam, gdzie nie starcza', () => {
    expect(
      missingFor(stock, { wood: 120, stone: 10, food: 0, iron: 0, sulfur: 5 }),
    ).toEqual({ wood: 20, stone: 0, food: 0, iron: 0, sulfur: 5 });
  });
});

describe('subtractCost', () => {
  it('odejmuje każdy zasób osobno i nie schodzi poniżej zera', () => {
    expect(
      subtractCost(stock, { wood: 30, stone: 50, food: 0, iron: 0, sulfur: 0 }),
    ).toEqual({ wood: 70, stone: 0, food: 0, iron: 10, sulfur: 0 });
  });
});

describe('addRefund', () => {
  it('dopisuje zwrot i nie melduje strat, gdy mieści się w magazynie', () => {
    const out = addRefund(
      stock,
      { wood: 50, stone: 0, food: 0, iron: 0, sulfur: 0 },
      1000,
    );
    expect(out.resources.wood).toBe(150);
    expect(out.lost).toEqual({
      wood: 0,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
    });
  });

  it('obcina do pojemności i melduje, ile przepadło', () => {
    const full = { wood: 200, stone: 0, food: 0, iron: 0, sulfur: 0 };
    const out = addRefund(
      full,
      { wood: 50, stone: 0, food: 0, iron: 0, sulfur: 0 },
      200,
    );
    expect(out.resources.wood).toBe(200);
    expect(out.lost.wood).toBe(50);
  });

  it('obcina osobno dla każdego zasobu', () => {
    const full = { wood: 200, stone: 10, food: 0, iron: 0, sulfur: 0 };
    const out = addRefund(
      full,
      { wood: 50, stone: 50, food: 0, iron: 0, sulfur: 0 },
      200,
    );
    expect(out.lost).toEqual({
      wood: 50,
      stone: 0,
      food: 0,
      iron: 0,
      sulfur: 0,
    });
    expect(out.resources.stone).toBe(60);
  });
});
```

- [ ] **Step 3: Uruchom oba i potwierdź porażkę**

Run: `npx vitest run src/domain/balance src/domain/economy`
Expected: FAIL — brak `spend.js` i brak nowych eksportów z `balance.js`.

- [ ] **Step 4: Rozszerz balans**

Dopisz do `src/domain/balance/balance.ts`:

```ts
export const COST_GROWTH = 1.6;
export const TIME_GROWTH = 1.5;

const r = (
  wood: number,
  stone: number,
  iron: number,
  sulfur: number,
): Resources => ({ wood, stone, food: 0, iron, sulfur });

/**
 * Koszt pierwszego poziomu. Żaden budynek nie kosztuje jedzenia — jedzenie jest
 * walutą wojska, nie budowy, co daje farmie sens także dla gracza bez armii.
 */
export const BASE_COST: Record<Building, Resources> = {
  SAWMILL: r(60, 40, 0, 0),
  QUARRY: r(60, 40, 0, 0),
  FARM: r(60, 40, 0, 0),
  IRON_MINE: r(80, 60, 0, 0),
  SULFUR_PIT: r(80, 60, 0, 0),
  WAREHOUSE: r(120, 100, 0, 0),
  TOWN_HALL: r(200, 180, 20, 0),
  BARRACKS: r(180, 140, 40, 0),
  SHIPYARD: r(260, 120, 60, 0),
};

/** Czas pierwszego poziomu w sekundach. */
export const BASE_TIME_SECONDS: Record<Building, number> = {
  SAWMILL: 300,
  QUARRY: 300,
  FARM: 300,
  IRON_MINE: 480,
  SULFUR_PIT: 480,
  WAREHOUSE: 720,
  TOWN_HALL: 1800,
  BARRACKS: 1500,
  SHIPYARD: 2100,
};

export function upgradeCost(building: Building, targetLevel: number): Resources {
  const factor = COST_GROWTH ** (targetLevel - 1);
  const base = BASE_COST[building];
  const out = emptyResources();
  for (const key of RESOURCES) out[key] = Math.ceil(base[key] * factor);
  return out;
}

export function upgradeSeconds(building: Building, targetLevel: number): number {
  return Math.ceil(BASE_TIME_SECONDS[building] * TIME_GROWTH ** (targetLevel - 1));
}

export const MILITARY_TYPES = [
  'SETTLER',
  'MILITIA',
  'SLOOP',
  'GALLEON',
] as const;
export type MilitaryType = (typeof MILITARY_TYPES)[number];

export const UNIT_BUILDING: Record<MilitaryType, Building> = {
  SETTLER: 'TOWN_HALL',
  MILITIA: 'BARRACKS',
  SLOOP: 'SHIPYARD',
  GALLEON: 'SHIPYARD',
};

export const UNIT_COST: Record<MilitaryType, Resources> = {
  SETTLER: { wood: 80, stone: 60, food: 200, iron: 0, sulfur: 0 },
  MILITIA: { wood: 20, stone: 10, food: 40, iron: 10, sulfur: 0 },
  SLOOP: { wood: 120, stone: 0, food: 60, iron: 20, sulfur: 0 },
  GALLEON: { wood: 300, stone: 0, food: 150, iron: 80, sulfur: 20 },
};

export const UNIT_SECONDS: Record<MilitaryType, number> = {
  SETTLER: 1200,
  MILITIA: 120,
  SLOOP: 600,
  GALLEON: 1500,
};

/** Miejsca zajmowane w populacji osady (słownik: Population). */
export const UNIT_POPULATION: Record<MilitaryType, number> = {
  SETTLER: 5,
  MILITIA: 1,
  SLOOP: 3,
  GALLEON: 8,
};

export function recruitCost(type: MilitaryType, count: number): Resources {
  const unit = UNIT_COST[type];
  const out = emptyResources();
  for (const key of RESOURCES) out[key] = unit[key] * count;
  return out;
}

export function recruitSeconds(type: MilitaryType, count: number): number {
  return UNIT_SECONDS[type] * count;
}

export function populationOf(
  counts: Partial<Record<MilitaryType, number>>,
): number {
  let total = 0;
  for (const type of MILITARY_TYPES) {
    total += UNIT_POPULATION[type] * (counts[type] ?? 0);
  }
  return total;
}
```

Dopisz `RESOURCES` do importów z `../rules/index.js`.

- [ ] **Step 5: Napisz `spend.ts`**

`src/domain/economy/spend.ts`:

```ts
import { RESOURCES, type Resources, emptyResources } from '../rules/index.js';

export function canAfford(stock: Resources, cost: Resources): boolean {
  return RESOURCES.every((r) => stock[r] >= cost[r]);
}

/** Niedobór dla każdego zasobu; zero tam, gdzie starcza. */
export function missingFor(stock: Resources, cost: Resources): Resources {
  const out = emptyResources();
  for (const r of RESOURCES) out[r] = Math.max(cost[r] - stock[r], 0);
  return out;
}

export function subtractCost(stock: Resources, cost: Resources): Resources {
  const out = emptyResources();
  for (const r of RESOURCES) out[r] = Math.max(stock[r] - cost[r], 0);
  return out;
}

/**
 * Dopisuje zwrot, obcinając do pojemności osobno dla każdego zasobu. Nadwyżka
 * przepada (słownik: Capacity), ale funkcja melduje ile — odpowiedź na anulowanie
 * ma to pokazać graczowi, zamiast cicho go okraść.
 */
export function addRefund(
  stock: Resources,
  refund: Resources,
  capacity: number,
): { resources: Resources; lost: Resources } {
  const resources = emptyResources();
  const lost = emptyResources();
  for (const r of RESOURCES) {
    const sum = stock[r] + refund[r];
    resources[r] = Math.min(sum, capacity);
    lost[r] = Math.max(sum - capacity, 0);
  }
  return { resources, lost };
}
```

W `src/domain/economy/index.ts` dopisz `export * from './spend.js';`

- [ ] **Step 6: Uruchom testy**

Run: `npx vitest run src/domain`
Expected: PASS.

- [ ] **Step 7: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add upgrade and recruitment balance formulas and pure spending helpers"
```

---

## Task 4: Typ zlecenia i projekcja terminów w kolejce

**Files:**
- Create: `src/domain/orders/work-order.ts`, `src/domain/orders/queue-projection.ts`, `src/domain/orders/queue-projection.spec.ts`, `src/domain/orders/index.ts`

**Interfaces:**
- Consumes: `Building` z `domain/rules`, `MilitaryType`, `upgradeSeconds`, `recruitSeconds` z `domain/balance`.
- Produces:
  - `type OrderKind = 'BUILD' | 'RECRUIT'`
  - `interface BuildWorkOrder { id: string; kind: 'BUILD'; position: number; startedAt: Date | null; finishAt: Date | null; building: Building; targetLevel: number }`
  - `interface RecruitWorkOrder { id: string; kind: 'RECRUIT'; position: number; startedAt: Date | null; finishAt: Date | null; unit: MilitaryType; count: number }`
  - `type WorkOrder = BuildWorkOrder | RecruitWorkOrder`
  - `durationSeconds(order: WorkOrder): number`
  - `projectFinishTimes(orders: WorkOrder[], now: Date): (WorkOrder & { finishAt: Date })[]`

- [ ] **Step 1: Napisz test projekcji**

`src/domain/orders/queue-projection.spec.ts`:

```ts
import type { WorkOrder } from './work-order.js';
import { durationSeconds, projectFinishTimes } from './queue-projection.js';

const t0 = new Date('2026-09-11T12:00:00.000Z');

function build(
  id: string,
  position: number,
  targetLevel: number,
  startedAt: Date | null = null,
  finishAt: Date | null = null,
): WorkOrder {
  return {
    id,
    kind: 'BUILD',
    position,
    startedAt,
    finishAt,
    building: 'SAWMILL',
    targetLevel,
  };
}

describe('projectFinishTimes', () => {
  it('czoło zachowuje swój faktyczny termin', () => {
    const head = build('a', 0, 2, t0, new Date(t0.getTime() + 450_000));
    const [out] = projectFinishTimes([head], t0);
    expect(out.finishAt.toISOString()).toBe(head.finishAt!.toISOString());
  });

  it('czekające dostają termin poprzednika powiększony o własny czas trwania', () => {
    const head = build('a', 0, 2, t0, new Date(t0.getTime() + 450_000));
    const next = build('b', 1, 3);
    const [, second] = projectFinishTimes([head, next], t0);
    expect(second.finishAt.getTime()).toBe(
      head.finishAt!.getTime() + durationSeconds(next) * 1000,
    );
  });

  it('łańcuch trzech zleceń sumuje się po kolei', () => {
    const head = build('a', 0, 2, t0, new Date(t0.getTime() + 450_000));
    const b = build('b', 1, 3);
    const c = build('c', 2, 4);
    const out = projectFinishTimes([head, b, c], t0);
    expect(out[2].finishAt.getTime()).toBe(
      head.finishAt!.getTime() +
        (durationSeconds(b) + durationSeconds(c)) * 1000,
    );
  });

  it('gdy czoło nie ma terminu, projekcja startuje od teraz', () => {
    const orphan = build('a', 0, 2);
    const [out] = projectFinishTimes([orphan], t0);
    expect(out.finishAt.getTime()).toBe(
      t0.getTime() + durationSeconds(orphan) * 1000,
    );
  });

  it('nie zmienia kolejności ani nie gubi zleceń', () => {
    const head = build('a', 0, 2, t0, new Date(t0.getTime() + 450_000));
    const out = projectFinishTimes([head, build('b', 1, 3)], t0);
    expect(out.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('czas trwania rekrutacji jest liniowy od liczby sztuk', () => {
    const one: WorkOrder = {
      id: 'r1',
      kind: 'RECRUIT',
      position: 0,
      startedAt: null,
      finishAt: null,
      unit: 'MILITIA',
      count: 1,
    };
    const five: WorkOrder = { ...one, id: 'r5', count: 5 };
    expect(durationSeconds(five)).toBe(durationSeconds(one) * 5);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/domain/orders`
Expected: FAIL — brak modułów.

- [ ] **Step 3: Napisz typy zlecenia**

`src/domain/orders/work-order.ts`:

```ts
import type { MilitaryType } from '../balance/index.js';
import type { Building } from '../rules/index.js';

export type OrderKind = 'BUILD' | 'RECRUIT';

interface WorkOrderBase {
  id: string;
  position: number;
  /** Niepuste wyłącznie dla czoła kolejki. */
  startedAt: Date | null;
  /** Faktyczny dla czoła, pusty dla czekających — projekcję dokłada `projectFinishTimes`. */
  finishAt: Date | null;
}

export interface BuildWorkOrder extends WorkOrderBase {
  kind: 'BUILD';
  building: Building;
  targetLevel: number;
}

export interface RecruitWorkOrder extends WorkOrderBase {
  kind: 'RECRUIT';
  unit: MilitaryType;
  count: number;
}

/** Unia rozróżniana po `kind` — konsekwencja jednej tabeli z rozróżnikiem (ADR 0003). */
export type WorkOrder = BuildWorkOrder | RecruitWorkOrder;
```

- [ ] **Step 4: Napisz projekcję**

`src/domain/orders/queue-projection.ts`:

```ts
import { recruitSeconds, upgradeSeconds } from '../balance/index.js';
import type { WorkOrder } from './work-order.js';

export function durationSeconds(order: WorkOrder): number {
  return order.kind === 'BUILD'
    ? upgradeSeconds(order.building, order.targetLevel)
    : recruitSeconds(order.unit, order.count);
}

/**
 * Uzupełnia termin ukończenia dla całej kolejki: czoło zachowuje swój faktyczny,
 * każde czekające dostaje termin poprzednika powiększony o własny czas trwania.
 *
 * Projekcja jest wiarygodna, a nie orientacyjna, bo rozstrzyganie startuje następne
 * zlecenie od `finish_at` poprzednika, a nie od chwili obudzenia workera — opóźnienie
 * workera nie przesuwa więc łańcucha.
 *
 * `orders` muszą być jednego rodzaju i posortowane po `position` rosnąco.
 */
export function projectFinishTimes(
  orders: WorkOrder[],
  now: Date,
): (WorkOrder & { finishAt: Date })[] {
  let previous = now;
  return orders.map((order) => {
    const finishAt =
      order.finishAt ??
      new Date(previous.getTime() + durationSeconds(order) * 1000);
    previous = finishAt;
    return { ...order, finishAt };
  });
}
```

`src/domain/orders/index.ts`:

```ts
export * from './work-order.js';
export * from './queue-projection.js';
```

- [ ] **Step 5: Uruchom testy**

Run: `npx vitest run src/domain/orders`
Expected: PASS, 6 testów.

- [ ] **Step 6: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add work order types and queue finish-time projection"
```

---

## Task 5: Repozytoria zleceń i garnizonu, materializacja z blokadą wiersza

**Files:**
- Create: `src/modules/settlements/orders.repository.ts`
- Modify: `src/modules/settlements/settlements.repository.ts`, `src/modules/settlements/settlements.module.ts`

**Interfaces:**
- Consumes: `DB`, `Db`, `DbClient` z `infra/db/db.module.js`; tabele `settlementOrders`, `garrisons`, `settlements`, `buildings`; `currentResources`, `subtractCost`, `addRefund` z `domain/economy`; `productionPerHour`, `capacityFor` z `domain/balance`.
- Produces:
  - `SettlementsRepository.materializeForUpdate(client: DbClient, worldId: number, x: number, y: number, at: Date): Promise<MaterializedSettlement>` — blokuje wiersz, zapisuje zasoby na `at`, przestemplowuje `last_sync_at`, zwraca wiersz z poziomami budynków; rzuca `SettlementNotFound`, gdy osady nie ma.
  - `type MaterializedSettlement = { worldId; x; y; ownerId; biome; resources: Resources; capacity: number; levels: Record<Building, number> }`
  - `SettlementsRepository.writeResources(client, worldId, x, y, resources, at)` — zapis po wydatku albo zwrocie.
  - `SettlementsRepository.raiseBuildingLevel(client, worldId, x, y, building, level)`
  - `SettlementsRepository.addToGarrison(client, worldId, x, y, type, count)` — `INSERT … ON CONFLICT DO UPDATE`
  - `SettlementsRepository.garrisonOf(worldId, x, y): Promise<Record<MilitaryType, number>>`
  - `OrdersRepository.listForSettlement(worldId, x, y): Promise<SettlementOrderRow[]>` — nierozstrzygnięte, po `kind` i `position`
  - `OrdersRepository.insert(client, input): Promise<SettlementOrderRow>`
  - `OrdersRepository.findById(client, id, forUpdate?): Promise<SettlementOrderRow | undefined>`
  - `OrdersRepository.nextInQueue(client, worldId, x, y, kind): Promise<SettlementOrderRow | undefined>` — najniższa `position` z pustym `resolved_at`
  - `OrdersRepository.markResolved(client, id, at)`
  - `OrdersRepository.start(client, id, startedAt, finishAt)`
  - `OrdersRepository.deleteAndCompact(client, order)` — usuwa i przesuwa dalsze pozycje o jeden w dół
  - `OrdersRepository.countInQueue(client, worldId, x, y, kind): Promise<number>`
  - `OrdersRepository.pendingBefore(at: Date, limit: number): Promise<SettlementOrderRow[]>` — zaległe, po `finish_at` rosnąco
  - `OrdersRepository.startedInFuture(at: Date): Promise<SettlementOrderRow[]>`

- [ ] **Step 1: Napisz materializację**

Dopisz do `src/modules/settlements/settlements.repository.ts`:

```ts
export class SettlementNotFound extends Error {
  constructor(worldId: number, x: number, y: number) {
    super(`Osada (${worldId}, ${x}, ${y}) nie istnieje`);
    this.name = 'SettlementNotFound';
  }
}

export interface MaterializedSettlement {
  worldId: number;
  x: number;
  y: number;
  ownerId: number;
  biome: Biome;
  resources: Resources;
  capacity: number;
  levels: Record<Building, number>;
}
```

oraz metodę:

```ts
  /**
   * Blokuje wiersz osady, nalicza zasoby na moment `at`, zapisuje je i przestemplowuje
   * znacznik synchronizacji. Wołający MUSI być w transakcji — blokada żyje do jej końca.
   *
   * Kolejność jest kontraktem: kto podnosi poziom budynku wydobywczego, woła to NAJPIERW,
   * bo inaczej cała przeszłość od ostatniej synchronizacji naliczy się nową, wyższą stawką.
   */
  async materializeForUpdate(
    client: DbClient,
    worldId: number,
    x: number,
    y: number,
    at: Date,
  ): Promise<MaterializedSettlement> {
    const [row] = await client
      .select()
      .from(settlements)
      .where(
        and(
          eq(settlements.worldId, worldId),
          eq(settlements.x, x),
          eq(settlements.y, y),
        ),
      )
      .for('update');
    if (!row) throw new SettlementNotFound(worldId, x, y);

    const levelRows = await client
      .select({ type: buildings.type, level: buildings.level })
      .from(buildings)
      .where(
        and(
          eq(buildings.worldId, worldId),
          eq(buildings.x, x),
          eq(buildings.y, y),
        ),
      );
    const levels = {} as Record<Building, number>;
    for (const l of levelRows) levels[l.type] = l.level;

    const capacity = capacityFor(levels);
    const stored: Resources = {
      wood: row.wood,
      stone: row.stone,
      food: row.food,
      iron: row.iron,
      sulfur: row.sulfur,
    };
    const resources = currentResources(
      stored,
      productionPerHour(row.biome, levels),
      row.lastSyncAt,
      at,
      capacity,
    );

    await client
      .update(settlements)
      .set({ ...resources, lastSyncAt: at })
      .where(
        and(
          eq(settlements.worldId, worldId),
          eq(settlements.x, x),
          eq(settlements.y, y),
        ),
      );

    return {
      worldId,
      x,
      y,
      ownerId: row.ownerId,
      biome: row.biome,
      resources,
      capacity,
      levels,
    };
  }

  async writeResources(
    client: DbClient,
    worldId: number,
    x: number,
    y: number,
    resources: Resources,
    at: Date,
  ): Promise<void> {
    await client
      .update(settlements)
      .set({ ...resources, lastSyncAt: at })
      .where(
        and(
          eq(settlements.worldId, worldId),
          eq(settlements.x, x),
          eq(settlements.y, y),
        ),
      );
  }

  async raiseBuildingLevel(
    client: DbClient,
    worldId: number,
    x: number,
    y: number,
    building: Building,
    level: number,
  ): Promise<void> {
    await client
      .update(buildings)
      .set({ level })
      .where(
        and(
          eq(buildings.worldId, worldId),
          eq(buildings.x, x),
          eq(buildings.y, y),
          eq(buildings.type, building),
        ),
      );
  }

  async addToGarrison(
    client: DbClient,
    worldId: number,
    x: number,
    y: number,
    type: MilitaryType,
    count: number,
  ): Promise<void> {
    await client
      .insert(garrisons)
      .values({ worldId, x, y, type, count })
      .onConflictDoUpdate({
        target: [garrisons.worldId, garrisons.x, garrisons.y, garrisons.type],
        set: { count: sql`${garrisons.count} + ${count}` },
      });
  }

  async garrisonOf(
    worldId: number,
    x: number,
    y: number,
  ): Promise<Record<MilitaryType, number>> {
    const rows = await this.db
      .select({ type: garrisons.type, count: garrisons.count })
      .from(garrisons)
      .where(
        and(
          eq(garrisons.worldId, worldId),
          eq(garrisons.x, x),
          eq(garrisons.y, y),
        ),
      );
    const out = {} as Record<MilitaryType, number>;
    for (const t of MILITARY_TYPES) out[t] = 0;
    for (const row of rows) out[row.type] = row.count;
    return out;
  }
```

Dopisz brakujące importy (`sql`, `garrisons`, `buildings`, `MILITARY_TYPES`, `MilitaryType`, `capacityFor`, `productionPerHour`, `currentResources`, `Resources`, `Biome`, `Building`, `DbClient`).

- [ ] **Step 2: Napisz repozytorium zleceń**

`src/modules/settlements/orders.repository.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { settlementOrders } from '../../infra/db/schema/index.js';

export type SettlementOrderRow = typeof settlementOrders.$inferSelect;
export type InsertOrder = typeof settlementOrders.$inferInsert;

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Nierozstrzygnięte zlecenia osady, uporządkowane po rodzaju i pozycji. */
  listForSettlement(
    worldId: number,
    x: number,
    y: number,
  ): Promise<SettlementOrderRow[]> {
    return this.db
      .select()
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.x, x),
          eq(settlementOrders.y, y),
          isNull(settlementOrders.resolvedAt),
        ),
      )
      .orderBy(asc(settlementOrders.kind), asc(settlementOrders.position));
  }

  async insert(
    client: DbClient,
    input: InsertOrder,
  ): Promise<SettlementOrderRow> {
    const [row] = await client
      .insert(settlementOrders)
      .values(input)
      .returning();
    return row;
  }

  async findById(
    client: DbClient,
    id: string,
  ): Promise<SettlementOrderRow | undefined> {
    const [row] = await client
      .select()
      .from(settlementOrders)
      .where(eq(settlementOrders.id, id));
    return row;
  }

  /** Następne nierozstrzygnięte zlecenie danej kolejki, czyli o najniższej pozycji. */
  async nextInQueue(
    client: DbClient,
    worldId: number,
    x: number,
    y: number,
    kind: 'BUILD' | 'RECRUIT',
  ): Promise<SettlementOrderRow | undefined> {
    const [row] = await client
      .select()
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.x, x),
          eq(settlementOrders.y, y),
          eq(settlementOrders.kind, kind),
          isNull(settlementOrders.resolvedAt),
        ),
      )
      .orderBy(asc(settlementOrders.position))
      .limit(1);
    return row;
  }

  async markResolved(client: DbClient, id: string, at: Date): Promise<void> {
    await client
      .update(settlementOrders)
      .set({ resolvedAt: at })
      .where(eq(settlementOrders.id, id));
  }

  async start(
    client: DbClient,
    id: string,
    startedAt: Date,
    finishAt: Date,
  ): Promise<void> {
    await client
      .update(settlementOrders)
      .set({ startedAt, finishAt })
      .where(eq(settlementOrders.id, id));
  }

  /** Usuwa zlecenie i zasuwa pozycje dalszych zleceń tej samej kolejki o jeden w dół. */
  async deleteAndCompact(
    client: DbClient,
    order: SettlementOrderRow,
  ): Promise<void> {
    await client
      .delete(settlementOrders)
      .where(eq(settlementOrders.id, order.id));
    await client
      .update(settlementOrders)
      .set({ position: sql`${settlementOrders.position} - 1` })
      .where(
        and(
          eq(settlementOrders.worldId, order.worldId),
          eq(settlementOrders.x, order.x),
          eq(settlementOrders.y, order.y),
          eq(settlementOrders.kind, order.kind),
          isNull(settlementOrders.resolvedAt),
          gt(settlementOrders.position, order.position),
        ),
      );
  }

  async countInQueue(
    client: DbClient,
    worldId: number,
    x: number,
    y: number,
    kind: 'BUILD' | 'RECRUIT',
  ): Promise<number> {
    const [row] = await client
      .select({ n: sql<number>`count(*)::int` })
      .from(settlementOrders)
      .where(
        and(
          eq(settlementOrders.worldId, worldId),
          eq(settlementOrders.x, x),
          eq(settlementOrders.y, y),
          eq(settlementOrders.kind, kind),
          isNull(settlementOrders.resolvedAt),
        ),
      );
    return row?.n ?? 0;
  }

  /**
   * Zaległe zlecenia, po `finish_at` rosnąco. Kolejność jest istotna dla arytmetyki:
   * rozbudowa tartaku z poniedziałku zmienia stawkę, którą liczy się zasoby dla
   * rekrutacji z wtorku.
   */
  pendingBefore(at: Date, limit: number): Promise<SettlementOrderRow[]> {
    return this.db
      .select()
      .from(settlementOrders)
      .where(
        and(
          isNull(settlementOrders.resolvedAt),
          lte(settlementOrders.finishAt, at),
        ),
      )
      .orderBy(asc(settlementOrders.finishAt))
      .limit(limit);
  }

  /** Zlecenia biegnące z terminem w przyszłości — do ponownego zaplanowania zadań. */
  startedInFuture(at: Date): Promise<SettlementOrderRow[]> {
    return this.db
      .select()
      .from(settlementOrders)
      .where(
        and(
          isNull(settlementOrders.resolvedAt),
          gt(settlementOrders.finishAt, at),
        ),
      );
  }
}
```

Dodaj `OrdersRepository` do `providers` i `exports` w `src/modules/settlements/settlements.module.ts`.

- [ ] **Step 3: Zbuduj i uruchom istniejące testy**

Run: `npm run lint && npm run build && npm run test:e2e`
Expected: build czysty, wszystkie istniejące testy przechodzą. Nowe metody nie mają jeszcze własnych testów — pokryją je Task 7 i Task 9, bo poza transakcją i kontekstem zlecenia nie mają sensownego zachowania do sprawdzenia.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add order repository and settlement materialization under a row lock"
```

---

## Task 6: Rozszerzony widok osady — garnizon, kolejka, koszty rozbudowy

**Files:**
- Modify: `src/modules/settlements/settlement-views.ts`, `src/modules/settlements/settlement-views.spec.ts`, `src/modules/settlements/settlements.repository.ts`, `src/modules/settlements/settlements.dto.ts`

**Interfaces:**
- Consumes: `projectFinishTimes`, `durationSeconds`, `WorkOrder` z `domain/orders`; `upgradeCost`, `upgradeSeconds`, `populationOf`, `MILITARY_TYPES`, `MilitaryType` z `domain/balance`; `slotsFor` z `domain/rules`.
- Produces:
  - `SettlementRecord` zyskuje `garrison: Record<MilitaryType, number>`, `orders: WorkOrder[]`, `fleetPopulation: number`
  - `OwnSettlementView` zyskuje `garrison`, `orders: OrderView[]`, `buildingUpgrades: Record<string, UpgradeView>`
  - `interface OrderView { id: string; kind: 'BUILD' | 'RECRUIT'; position: number; startedAt: string | null; finishAt: string; building?: string; targetLevel?: number; unit?: string; count?: number }`
  - `interface UpgradeView { targetLevel: number; cost: Resources; seconds: number }`
  - `PublicSettlementView` **bez zmian**
  - `SettlementsRepository.load` zwraca rekordy z garnizonem, zleceniami i populacją flot

- [ ] **Step 1: Napisz testy widoku**

Dopisz do `src/modules/settlements/settlement-views.spec.ts` (rozszerz stałą `record` o `garrison: { SETTLER: 0, MILITIA: 2, SLOOP: 0, GALLEON: 0 }`, `orders: []`, `fleetPopulation: 0`):

```ts
describe('ownView — pola specu B', () => {
  it('podaje garnizon i populację liczoną z garnizonu, kolejki i flot', () => {
    const view = ownView(
      {
        ...record,
        garrison: { SETTLER: 1, MILITIA: 2, SLOOP: 0, GALLEON: 0 },
        fleetPopulation: 3,
        orders: [
          {
            id: 'o1',
            kind: 'RECRUIT',
            position: 0,
            startedAt: now,
            finishAt: new Date(now.getTime() + 60_000),
            unit: 'MILITIA',
            count: 4,
          },
        ],
      },
      now,
    );
    expect(view.garrison).toEqual({
      SETTLER: 1,
      MILITIA: 2,
      SLOOP: 0,
      GALLEON: 0,
    });
    // 1 osadnik (5) + 2 milicje (2) + flota (3) + 4 milicje w kolejce (4)
    expect(view.population).toBe(5 + 2 + 3 + 4);
  });

  it('każde zlecenie ma termin, także czekające, i nie ma pustych pól obcego rodzaju', () => {
    const head = {
      id: 'a',
      kind: 'BUILD' as const,
      position: 0,
      startedAt: now,
      finishAt: new Date(now.getTime() + 450_000),
      building: 'SAWMILL' as const,
      targetLevel: 2,
    };
    const waiting = {
      id: 'b',
      kind: 'BUILD' as const,
      position: 1,
      startedAt: null,
      finishAt: null,
      building: 'SAWMILL' as const,
      targetLevel: 3,
    };
    const view = ownView({ ...record, orders: [head, waiting] }, now);
    expect(view.orders).toHaveLength(2);
    expect(view.orders[0].startedAt).toBe(now.toISOString());
    expect(view.orders[1].startedAt).toBeNull();
    expect(typeof view.orders[1].finishAt).toBe('string');
    expect(new Date(view.orders[1].finishAt).getTime()).toBeGreaterThan(
      new Date(view.orders[0].finishAt).getTime(),
    );
    expect('unit' in view.orders[0]).toBe(false);
  });

  it('buildingUpgrades pokrywa sześć slotów i celuje w poziom po uwzględnieniu kolejki', () => {
    const view = ownView(
      {
        ...record,
        orders: [
          {
            id: 'a',
            kind: 'BUILD',
            position: 0,
            startedAt: now,
            finishAt: new Date(now.getTime() + 1),
            building: 'SAWMILL',
            targetLevel: 2,
          },
        ],
      },
      now,
    );
    expect(Object.keys(view.buildingUpgrades)).toHaveLength(6);
    // SAWMILL jest na poziomie 1, jedno zlecenie celuje w 2, więc następne celuje w 3.
    expect(view.buildingUpgrades.SAWMILL.targetLevel).toBe(3);
    expect(view.buildingUpgrades.SAWMILL.cost).toEqual(upgradeCost('SAWMILL', 3));
    expect(view.buildingUpgrades.SAWMILL.seconds).toBe(upgradeSeconds('SAWMILL', 3));
    // BARRACKS stoi na 0, więc celuje w 1.
    expect(view.buildingUpgrades.BARRACKS.targetLevel).toBe(1);
  });

  it('publicView nadal nie ma żadnego z nowych pól', () => {
    const view = publicView({
      ...record,
      garrison: { SETTLER: 9, MILITIA: 9, SLOOP: 9, GALLEON: 9 },
    });
    expect(Object.keys(view).sort()).toEqual([
      'name',
      'ownerId',
      'ownerName',
      'world',
      'x',
      'y',
    ]);
  });
});
```

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npx vitest run src/modules/settlements/settlement-views.spec.ts`
Expected: FAIL — brak pól w typie i w implementacji.

- [ ] **Step 3: Rozszerz widok**

W `src/modules/settlements/settlement-views.ts` dopisz do `SettlementRecord`:

```ts
  garrison: Record<MilitaryType, number>;
  orders: WorkOrder[];
  /** Miejsca zajęte przez statki i jednostki we własnych, nierozstrzygniętych flotach. */
  fleetPopulation: number;
```

typy widoku:

```ts
export interface OrderView {
  id: string;
  kind: 'BUILD' | 'RECRUIT';
  position: number;
  startedAt: string | null;
  /** Faktyczny dla czoła kolejki, przewidywany dla czekających. Zawsze obecny. */
  finishAt: string;
  building?: string;
  targetLevel?: number;
  unit?: string;
  count?: number;
}

export interface UpgradeView {
  targetLevel: number;
  cost: Resources;
  seconds: number;
}
```

i rozszerz `ownView`:

```ts
export function ownView(s: SettlementRecord, now: Date): OwnSettlementView {
  const rate = productionPerHour(s.biome, s.buildings);
  const capacity = capacityFor(s.buildings);

  const build = s.orders
    .filter((o): o is Extract<WorkOrder, { kind: 'BUILD' }> => o.kind === 'BUILD')
    .sort((a, b) => a.position - b.position);
  const recruit = s.orders
    .filter((o): o is Extract<WorkOrder, { kind: 'RECRUIT' }> => o.kind === 'RECRUIT')
    .sort((a, b) => a.position - b.position);

  // Każda kolejka rzutowana osobno, bo biegną równolegle i nie dzielą łańcucha terminów.
  const orders = [
    ...projectFinishTimes(build, now),
    ...projectFinishTimes(recruit, now),
  ].map(toOrderView);

  const queuedPopulation = populationOf(
    recruit.reduce<Partial<Record<MilitaryType, number>>>((acc, o) => {
      acc[o.unit] = (acc[o.unit] ?? 0) + o.count;
      return acc;
    }, {}),
  );

  return {
    ...publicView(s),
    resources: currentResources(s.resources, rate, s.lastSyncAt, now, capacity),
    productionPerHour: rate,
    capacity,
    population: populationOf(s.garrison) + queuedPopulation + s.fleetPopulation,
    populationMax: populationMaxFor(s.buildings),
    buildings: Object.fromEntries(
      slotsFor(s.biome).map((slot) => [slot, s.buildings[slot] ?? 0]),
    ),
    garrison: s.garrison,
    orders,
    buildingUpgrades: upgradesFor(s, build),
    lastSyncAt: now.toISOString(),
  };
}

function toOrderView(o: WorkOrder & { finishAt: Date }): OrderView {
  const base = {
    id: o.id,
    kind: o.kind,
    position: o.position,
    startedAt: o.startedAt ? o.startedAt.toISOString() : null,
    finishAt: o.finishAt.toISOString(),
  };
  return o.kind === 'BUILD'
    ? { ...base, building: o.building, targetLevel: o.targetLevel }
    : { ...base, unit: o.unit, count: o.count };
}

/**
 * Następny poziom to poziom bieżący powiększony o liczbę nierozstrzygniętych zleceń
 * dla tego budynku — dzięki temu klient i serwer mówią o tym samym poziomie także
 * wtedy, gdy gracz zakolejkował już dwie rozbudowy tego samego tartaku.
 */
function upgradesFor(
  s: SettlementRecord,
  build: Extract<WorkOrder, { kind: 'BUILD' }>[],
): Record<string, UpgradeView> {
  const queued = new Map<string, number>();
  for (const o of build) queued.set(o.building, (queued.get(o.building) ?? 0) + 1);

  const out: Record<string, UpgradeView> = {};
  for (const slot of slotsFor(s.biome)) {
    const targetLevel = (s.buildings[slot] ?? 0) + (queued.get(slot) ?? 0) + 1;
    out[slot] = {
      targetLevel,
      cost: upgradeCost(slot, targetLevel),
      seconds: upgradeSeconds(slot, targetLevel),
    };
  }
  return out;
}
```

Dopisz do `OwnSettlementView` trzy pola: `garrison: Record<MilitaryType, number>`, `orders: OrderView[]`, `buildingUpgrades: Record<string, UpgradeView>`.

- [ ] **Step 4: Wczytaj garnizon, zlecenia i populację flot w repozytorium**

W prywatnej metodzie `load` w `settlements.repository.ts`, po zbudowaniu `bases`, dołóż trzy odczyty i zmapuj je na rekordy. Populacja flot liczona z nierozstrzygniętych flot wyruszających z tej osady, sumując statki i jednostki ładunku:

```ts
    const fleetRows = await this.db
      .select({
        x: fleets.fromX,
        y: fleets.fromY,
        ships: fleets.ships,
        cargo: fleets.cargo,
      })
      .from(fleets)
      .where(
        and(eq(fleets.worldId, bases[0].worldId), isNull(fleets.resolvedAt)),
      );
    const fleetPop = new Map<string, number>();
    for (const f of fleetRows) {
      const key = coordKey(f.x, f.y);
      const units = { ...f.ships, ...f.cargo.units } as Partial<
        Record<MilitaryType, number>
      >;
      fleetPop.set(key, (fleetPop.get(key) ?? 0) + populationOf(units));
    }
```

Garnizon i zlecenia pobierz analogicznie, filtrując po współrzędnych z `bases`, i zmapuj wiersz zlecenia na `WorkOrder` — dla `BUILD` bierz `buildingType` i `targetLevel`, dla `RECRUIT` `militaryType` i `count`.

- [ ] **Step 5: Rozszerz DTO**

W `settlements.dto.ts` dopisz opcjonalne pola `garrison`, `orders`, `buildingUpgrades` obok istniejących opcjonalnych, z komentarzem, że jak `resources` są prywatne dla właściciela.

- [ ] **Step 6: Uruchom testy**

Run: `npm test && npm run test:e2e`
Expected: PASS. Istniejące testy e2e widzące własną osadę zobaczą nowe pola; jeśli któryś asertuje dokładny zestaw kluczy odpowiedzi osady, rozszerz go, nie osłabiaj.

- [ ] **Step 7: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Extend the owner settlement view with garrison, queue and upgrade costs"
```

---

## Task 7: Serwis rozstrzygania zleceń — serce tego specu

**Files:**
- Create: `src/modules/settlements/order-resolver.service.ts`, `test/orders-resolution.e2e-spec.ts`
- Modify: `src/modules/settlements/settlements.module.ts`

**Interfaces:**
- Consumes: `DB`, `Db`, `DbClient`; `OrdersRepository`; `SettlementsRepository`; `CLOCK`; `durationSeconds` z `domain/orders`.
- Produces:
  - `OrderResolver.resolve(orderId: string, now: Date): Promise<ScheduleRequest | null>` — własna transakcja
  - `OrderResolver.resolveWithin(tx: DbClient, orderId: string, now: Date): Promise<ScheduleRequest | null>` — w cudzej transakcji, dla przemiatania wsadowego
  - `type ScheduleRequest = { orderId: string; at: Date }` — zadanie do zaplanowania **po** zatwierdzeniu transakcji

- [ ] **Step 1: Napisz testy integracyjne**

`test/orders-resolution.e2e-spec.ts` — bez HTTP, na prawdziwej bazie, ze sterowanym zegarem. Zbuduj pomocnika stawiającego osadę z wybranymi poziomami budynków i zasobami, a potem:

```ts
  it('rozbudowa ukończona w przeszłości nalicza starą stawką do ukończenia i nową po niej', async () => {
    // SAWMILL na poziomie 1 (60/h). Zlecenie kończy się godzinę po ostatniej synchronizacji,
    // podnosząc go na 2 (120/h). Odczyt dwie godziny po synchronizacji.
    const start = new Date('2026-09-11T12:00:00.000Z');
    const finish = new Date('2026-09-11T13:00:00.000Z');
    const read = new Date('2026-09-11T14:00:00.000Z');
    const s = await makeSettlement({
      biome: 'TROPICAL',
      levels: { SAWMILL: 1, FARM: 1, WAREHOUSE: 5, TOWN_HALL: 1 },
      resources: { wood: 0, stone: 0, food: 0, iron: 0, sulfur: 0 },
      lastSyncAt: start,
    });
    const order = await queueBuildDirectly(s, 'SAWMILL', 2, start, finish);

    await resolver.resolve(order.id, read);

    const after = await readSettlement(s, read);
    // Godzina starą stawką (60) plus godzina nową (120) = 180. Wartość policzona ręcznie,
    // NIE tą samą funkcją, którą testujemy.
    expect(after.resources.wood).toBe(180);
  });

  it('powtórzone rozstrzygnięcie nie zmienia niczego', async () => {
    const { settlement, order, expected } = await resolvedUpgradeFixture();
    await resolver.resolve(order.id, expected.readAt);
    const twice = await readSettlement(settlement, expected.readAt);
    expect(twice.resources.wood).toBe(expected.wood);
    expect(twice.buildings.SAWMILL).toBe(expected.level);
  });

  it('przemiatanie rozstrzyga dwa zaległe zlecenia w kolejności terminów, nie wstawiania', async () => {
    // Wstawiamy najpierw to o PÓŹNIEJSZYM terminie, żeby kolejność wstawiania i kolejność
    // terminów były różne. Pierwsze zlecenie podnosi stawkę, więc odwrotna kolejność
    // rozstrzygania daje inną, błędną liczbę zasobów.
    ...
    expect(after.resources.wood).toBe(EXPECTED_CHRONOLOGICAL);
  });

  it('następne zlecenie startuje od terminu poprzednika, nie od chwili obudzenia', async () => {
    // Worker budzi się trzy godziny po terminie czoła. Termin następnego ma być
    // terminem poprzednika plus jego czas trwania — nieprzesunięty o te trzy godziny.
    ...
    expect(next.finishAt.toISOString()).toBe(expectedChainedFinish.toISOString());
  });

  it('dwa równoległe zamówienia na tę samą osadę serializują się', async () => {
    // Dwa jednoczesne wywołania na osadzie mającej zasoby na dokładnie jedno.
    // Jedno kończy się sukcesem, drugie konfliktem; zasoby spadają o jeden koszt, nie o dwa.
    ...
  });
```

Rozpisz pomocników i pozostałe trzy testy w pełni, w tym samym stylu co pierwszy — z wartościami oczekiwanymi policzonymi w teście ręcznie.

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npm run test:e2e -- test/orders-resolution.e2e-spec.ts`
Expected: FAIL — brak `OrderResolver`.

- [ ] **Step 3: Napisz serwis**

`src/modules/settlements/order-resolver.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { durationSeconds } from '../../domain/orders/index.js';
import type { Clock } from '../../domain/time/index.js';
import { DB, type Db, type DbClient } from '../../infra/db/db.module.js';
import { CLOCK } from '../../infra/time/time.module.js';
import { OrdersRepository, type SettlementOrderRow } from './orders.repository.js';
import { SettlementsRepository } from './settlements.repository.js';

/** Zadanie do zaplanowania PO zatwierdzeniu transakcji, żeby wycofanie nie zostawiło ducha. */
export interface ScheduleRequest {
  orderId: string;
  at: Date;
}

@Injectable()
export class OrderResolver {
  private readonly logger = new Logger(OrderResolver.name);

  constructor(
    private readonly orders: OrdersRepository,
    private readonly settlements: SettlementsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Rozstrzyga jedno zlecenie we własnej transakcji. */
  async resolve(orderId: string, now: Date): Promise<ScheduleRequest | null> {
    return this.db.transaction((tx) => this.resolveWithin(tx, orderId, now));
  }

  /**
   * Rozstrzyga jedno zlecenie w transakcji wywołującego. Przemiatanie wsadowe używa tej
   * wersji, żeby cały cykl trzymał jedną blokadę doradczą.
   */
  async resolveWithin(
    tx: DbClient,
    orderId: string,
    now: Date,
  ): Promise<ScheduleRequest | null> {
    const probe = await this.orders.findById(tx, orderId);
    if (!probe || probe.resolvedAt || !probe.finishAt) return null;

    // Blokada osady MUSI poprzedzać ponowny odczyt zlecenia — inaczej dwa równoległe
    // rozstrzygnięcia odczytałyby puste `resolved_at` i oba zastosowałyby skutek.
    // Materializacja na moment ukończenia, PRZED podniesieniem poziomu: reszta czasu
    // do `now` naliczy się już nową stawką przy następnym odczycie.
    const finishAt = probe.finishAt;
    await this.settlements.materializeForUpdate(
      tx,
      probe.worldId,
      probe.x,
      probe.y,
      finishAt,
    );

    const order = await this.orders.findById(tx, orderId);
    if (!order || order.resolvedAt) return null;

    await this.applyEffect(tx, order);
    await this.orders.markResolved(tx, order.id, finishAt);

    const next = await this.orders.nextInQueue(
      tx,
      order.worldId,
      order.x,
      order.y,
      order.kind,
    );
    if (!next) return null;

    // Łańcuchowanie od terminu poprzednika, nie od `now`: opóźnienie workera nie przesuwa
    // kolejki, a przewidywane terminy pokazywane graczowi zostają prawdziwe.
    const nextFinish = new Date(
      finishAt.getTime() + durationSeconds(toWorkOrder(next)) * 1000,
    );
    await this.orders.start(tx, next.id, finishAt, nextFinish);
    return { orderId: next.id, at: nextFinish };
  }

  private async applyEffect(
    tx: DbClient,
    order: SettlementOrderRow,
  ): Promise<void> {
    if (order.kind === 'BUILD') {
      await this.settlements.raiseBuildingLevel(
        tx,
        order.worldId,
        order.x,
        order.y,
        order.buildingType!,
        order.targetLevel!,
      );
    } else {
      await this.settlements.addToGarrison(
        tx,
        order.worldId,
        order.x,
        order.y,
        order.militaryType!,
        order.count!,
      );
    }
  }
}
```

Dopisz eksportowaną funkcję `toWorkOrder(row: SettlementOrderRow): WorkOrder` w `orders.repository.ts` — mapowanie wiersza na unię rozróżnianą, używane też w Task 6.

Dodaj `OrderResolver` do `providers` i `exports` modułu osad.

- [ ] **Step 4: Uruchom testy**

Run: `npm run test:e2e -- test/orders-resolution.e2e-spec.ts`
Expected: PASS, pięć testów.

- [ ] **Step 5: Weryfikacja mutacyjna — obowiązkowa**

Postaw trzy mutanty, **pojedynczo**, za każdym razem uruchamiając zestaw, potwierdzając porażkę właściwego testu i przywracając kod:

1. W `resolveWithin` zamień `materializeForUpdate(..., finishAt)` na `materializeForUpdate(..., now)`. Ma paść test naliczania odcinkowego.
2. Przenieś `materializeForUpdate` **za** `applyEffect`. Ma paść ten sam test, z inną, wyższą liczbą.
3. W `pendingBefore` zamień `orderBy(asc(finishAt))` na `orderBy(asc(createdAt))`. Ma paść test kolejności przemiatania.

Wklej do raportu wyjście każdego mutanta oraz potwierdzenie, że `git diff` po przywróceniu jest pusty.

- [ ] **Step 6: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add the order resolver with finish-time materialization and queue chaining"
```

---

## Task 8: Kolejka BullMQ, worker i przemiatanie z blokadą doradczą

**Files:**
- Create: `src/infra/queue/orders.queue.ts`, `src/infra/queue/orders.worker.ts`, `src/infra/queue/sweeper.ts`, `src/infra/queue/queue.module.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `REDIS`, `RedisClient`; `OrderResolver`, `OrdersRepository`; `DB`, `Db`; `CLOCK`, `Clock`; `ENV`, `Env`.
- Produces:
  - `ORDERS_QUEUE_NAME = 'settlement-orders'`
  - `OrdersQueue.schedule(request: ScheduleRequest): Promise<void>` — `jobId` równy identyfikatorowi zlecenia, opóźnienie `max(0, at - now)`
  - `OrdersQueue.close(): Promise<void>`
  - `OrdersWorker` — startuje wyłącznie gdy `WORKER_ENABLED`
  - `OrdersSweeper.sweepOnce(): Promise<number>` — zwraca liczbę rozstrzygniętych zleceń; `0` także wtedy, gdy blokada doradcza jest zajęta
  - `SWEEP_LOCK_KEY = 823140001`

- [ ] **Step 1: Napisz kolejkę**

`src/infra/queue/orders.queue.ts`:

```ts
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Clock } from '../../domain/time/index.js';
import type { ScheduleRequest } from '../../modules/settlements/order-resolver.service.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { CLOCK } from '../time/time.module.js';

export const ORDERS_QUEUE_NAME = 'settlement-orders';

export interface OrderJobData {
  orderId: string;
}

@Injectable()
export class OrdersQueue implements OnApplicationShutdown {
  private readonly queue: Queue<OrderJobData>;

  constructor(
    @Inject(REDIS) redis: RedisClient,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.queue = new Queue<OrderJobData>(ORDERS_QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: 100 },
    });
  }

  /**
   * Planuje budzik na moment ukończenia zlecenia. `jobId` równy identyfikatorowi zlecenia
   * czyni planowanie idempotentnym: powtórne zaplanowanie — przez przemiatanie na kilku
   * instancjach albo po restarcie — nie tworzy drugiego zadania.
   */
  async schedule(request: ScheduleRequest): Promise<void> {
    const delay = Math.max(0, request.at.getTime() - this.clock.now().getTime());
    await this.queue.add(
      'resolve',
      { orderId: request.orderId },
      { jobId: request.orderId, delay },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
```

- [ ] **Step 2: Napisz przemiatanie**

`src/infra/queue/sweeper.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Clock } from '../../domain/time/index.js';
import {
  OrderResolver,
  type ScheduleRequest,
} from '../../modules/settlements/order-resolver.service.js';
import { OrdersRepository } from '../../modules/settlements/orders.repository.js';
import { DB, type Db } from '../db/db.module.js';
import { CLOCK } from '../time/time.module.js';
import { OrdersQueue } from './orders.queue.js';

/** Stały klucz blokady doradczej dla cyklu przemiatania. */
export const SWEEP_LOCK_KEY = 823140001;
const SWEEP_BATCH = 200;

@Injectable()
export class OrdersSweeper {
  private readonly logger = new Logger(OrdersSweeper.name);

  constructor(
    private readonly orders: OrdersRepository,
    private readonly resolver: OrderResolver,
    private readonly queue: OrdersQueue,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Jeden cykl: rozstrzyga zaległe zlecenia po `finish_at` rosnąco i planuje na nowo zadania
   * dla zleceń biegnących z terminem w przyszłości (Redis mógł zostać wyczyszczony, baza nie).
   *
   * Blokada doradcza transakcyjna sprawia, że przy wielu instancjach cykl wykonuje jedna
   * replika, a pozostałe pomijają swój przebieg bez błędu. Wybrana w bazie, nie w Redisie,
   * bo baza jest już źródłem prawdy dla zleceń.
   */
  async sweepOnce(): Promise<number> {
    const now = this.clock.now();
    const scheduled: ScheduleRequest[] = [];

    const resolvedCount = await this.db.transaction(async (tx) => {
      const [lock] = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(${SWEEP_LOCK_KEY}) AS locked`,
      );
      if (!lock?.locked) return 0;

      const pending = await this.orders.pendingBefore(now, SWEEP_BATCH);
      let count = 0;
      for (const order of pending) {
        const next = await this.resolver.resolveWithin(tx, order.id, now);
        if (next) scheduled.push(next);
        count += 1;
      }
      return count;
    });

    // Planowanie PO zatwierdzeniu: wycofana transakcja nie zostawia ducha w kolejce,
    // a zgubione zaplanowanie i tak złapie następny cykl.
    for (const request of scheduled) await this.queue.schedule(request);

    if (resolvedCount > 0) {
      this.logger.log(`Przemiatanie rozstrzygnęło ${resolvedCount} zleceń`);
    }

    for (const order of await this.orders.startedInFuture(now)) {
      if (order.finishAt) {
        await this.queue.schedule({ orderId: order.id, at: order.finishAt });
      }
    }
    return resolvedCount;
  }
}
```

- [ ] **Step 3: Napisz workera i moduł**

`src/infra/queue/orders.worker.ts`:

```ts
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Clock } from '../../domain/time/index.js';
import { OrderResolver } from '../../modules/settlements/order-resolver.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { REDIS, type RedisClient } from '../redis/redis.module.js';
import { CLOCK } from '../time/time.module.js';
import { ORDERS_QUEUE_NAME, OrdersQueue, type OrderJobData } from './orders.queue.js';
import { OrdersSweeper } from './sweeper.js';

/**
 * Cienka przejściówka: cała logika żyje w `OrderResolver`, żeby testy integracyjne
 * mogły ją wołać wprost, bez czekania na prawdziwe opóźnienia kolejki.
 */
@Injectable()
export class OrdersWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OrdersWorker.name);
  private worker?: Worker<OrderJobData>;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly resolver: OrderResolver,
    private readonly queue: OrdersQueue,
    private readonly sweeper: OrdersSweeper,
    @Inject(REDIS) private readonly redis: RedisClient,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.WORKER_ENABLED) return;

    this.worker = new Worker<OrderJobData>(
      ORDERS_QUEUE_NAME,
      async (job) => {
        const next = await this.resolver.resolve(
          job.data.orderId,
          this.clock.now(),
        );
        if (next) await this.queue.schedule(next);
      },
      { connection: this.redis },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Zadanie ${job?.id ?? '?'} zawiodło: ${err.message}`,
        err.stack,
      );
    });

    await this.sweeper.sweepOnce();
    this.timer = setInterval(() => {
      void this.sweeper.sweepOnce().catch((err: unknown) => {
        this.logger.error(
          'Cykl przemiatania zawiódł',
          err instanceof Error ? err.stack : String(err),
        );
      });
    }, this.env.SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
  }
}
```

`src/infra/queue/queue.module.ts` rejestruje `OrdersQueue`, `OrdersSweeper` i `OrdersWorker`, importuje `SettlementsModule` (dla `OrderResolver` i `OrdersRepository`) i eksportuje `OrdersQueue`. Dodaj go do `AppModule` **po** `SettlementsModule`.

- [ ] **Step 4: Napisz test przejściówki i blokady**

Dopisz do `test/orders-resolution.e2e-spec.ts` dwa testy:

```ts
  it('dwa równoległe cykle przemiatania: tylko jeden wykonuje pracę', async () => {
    await queueOverdueUpgrade();
    const [a, b] = await Promise.all([
      sweeper.sweepOnce(),
      sweeper.sweepOnce(),
    ]);
    // Jeden cykl rozstrzyga, drugi trafia na zajętą blokadę i pomija przebieg bez błędu.
    expect([a, b].sort()).toEqual([0, 1]);
  });

  it('worker podpięty do kolejki rozstrzyga zlecenie', async () => {
    // Jedyny test dowodzący, że przejściówka jest podpięta. Aplikacja z WORKER_ENABLED=true,
    // zlecenie z terminem w przeszłości, oczekiwanie na rozstrzygnięcie z limitem czasu.
    ...
  });
```

Rozpisz drugi test w pełni, z aplikacją budowaną przez `createTestApp({ env: { WORKER_ENABLED: 'true' } })` i odpytywaniem stanu w pętli z limitem pięciu sekund.

- [ ] **Step 5: Uruchom testy**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 6: Weryfikacja mutacyjna**

Usuń blokadę doradczą z `sweepOnce` (zawsze traktuj jako zdobytą). Ma paść test dwóch równoległych cykli. Przywróć kod, potwierdź pusty `git diff`.

- [ ] **Step 7: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add the BullMQ queue, worker and a sweeper guarded by an advisory lock"
```

---

## Task 9: Serwis kolejkowania i anulowania zleceń

**Files:**
- Create: `src/modules/settlements/orders.service.ts`
- Modify: `src/modules/settlements/settlements.module.ts`

**Interfaces:**
- Produces:
  - `OrdersService.queueUpgrade(world, x, y, playerId, building): Promise<{ view: OwnSettlementView; schedule: ScheduleRequest | null }>`
  - `OrdersService.queueRecruit(world, x, y, playerId, unit, count): Promise<{ view; schedule }>`
  - `OrdersService.cancel(world, x, y, playerId, orderId): Promise<{ view; lost: Resources }>`
  - `MAX_QUEUE_LENGTH = 5`
  - Wyjątki: `InsufficientResources` (409 z polem `missing`), `QueueFull` (409), `PopulationExceeded` (409), `OrderAlreadyStarted` (409), `LaterOrderExists` (409), `BuildingNotInBiome` (409), `BuildingTooLow` (409)

- [ ] **Step 1: Napisz testy e2e kolejkowania**

`test/orders.e2e-spec.ts` — rozpisz w pełni, ze sterowanym zegarem i fixtures `queueUpgrade`, `queueRecruit`, `cancelOrder` dopisanymi do `test/support/fixtures.ts`:

- rozbudowa zwraca pełny widok osady z jednym zleceniem w kolejce, o pozycji zero i niepustym `startedAt`;
- druga rozbudowa tego samego budynku celuje w poziom o jeden wyższy, kosztuje więcej i czeka z pustym `startedAt`, ale ma przewidywany `finishAt`;
- brak zasobów daje 409 z polem `missing` wskazującym niedobór;
- szósta rozbudowa w kolejce daje 409 o pełnej kolejce;
- rekrutacja bez koszar daje 409;
- rekrutacja przekraczająca limit populacji **liczący także zlecenia czekające** daje 409;
- anulowanie zlecenia nierozpoczętego zwraca koszt i pole `lost` z zerami;
- anulowanie przy pełnym magazynie zwraca `lost` z niezerową wartością;
- anulowanie zlecenia rozpoczętego daje 409;
- anulowanie rozbudowy mającej za sobą późniejsze zlecenie dla tego samego budynku daje 409;
- anulowanie zlecenia z kolejki, po którym są dalsze, zasuwa ich pozycje do zwartego ciągu;
- zapis na świecie `ENDED` daje 409;
- cudza osada daje 403.

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npm run test:e2e -- test/orders.e2e-spec.ts`
Expected: FAIL — wszystkie trasy zwracają 404.

- [ ] **Step 3: Napisz serwis**

`orders.service.ts` w jednej transakcji na operację, w kolejności: zablokuj i zmaterializuj osadę na `now`; sprawdź warunki (biom i slot dla rozbudowy, budynek i jego poziom dla rekrutacji, długość kolejki, populacja z garnizonu, flot i kolejki); policz koszt dla poziomu docelowego równego bieżącemu plus liczbie nierozstrzygniętych zleceń tego budynku plus jeden; sprawdź `canAfford`, inaczej rzuć `InsufficientResources` z `missingFor`; odejmij koszt i zapisz; wstaw zlecenie z pozycją równą długości kolejki i migawką kosztu; jeśli pozycja to zero, ustaw `startedAt = now` i `finishAt = now + czas trwania` i zwróć `ScheduleRequest`.

Anulowanie: zablokuj i zmaterializuj; wczytaj zlecenie, sprawdź przynależność do tej osady; `startedAt` niepuste to `OrderAlreadyStarted`; dla `BUILD` istnienie późniejszego nierozstrzygniętego zlecenia tego samego budynku to `LaterOrderExists`; `addRefund` z migawki kosztu, zapisz zasoby, `deleteAndCompact`, zwróć widok i `lost`.

- [ ] **Step 4: Uruchom testy**

Run: `npm run test:e2e`
Expected: PASS.

- [ ] **Step 5: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Add the order service for queueing upgrades, recruitment and cancellation"
```

---

## Task 10: Trzy trasy HTTP

**Files:**
- Modify: `src/modules/settlements/settlements.controller.ts`, `src/modules/settlements/settlements.dto.ts`, `src/modules/settlements/settlements.module.ts`

**Interfaces:**
- Produces: trzy trasy z sekcji 7 specyfikacji, wszystkie za `ProfileGuard` i `WorldWritableGuard`, wszystkie zwracające pełny widok osady. `RecruitDto` z walidacją: `type` z `MILITARY_TYPES`, `count` całkowite w zakresie 1–100.

- [ ] **Step 1: Napisz DTO i trasy**

```ts
  @Post(':x/:y/buildings/:type/upgrade')
  @UseGuards(WorldWritableGuard)
  @HttpCode(200)
  @ApiOkResponse({ type: SettlementDto })
  @ApiConflictResponse({ description: 'Brak zasobów, pełna kolejka albo świat zakończony' })
  async upgrade(
    @Req() req: WorldRequest,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Param('type', new ParseEnumPipe(BUILDINGS)) type: Building,
  ): Promise<SettlementDto> {
    const { view, schedule } = await this.orders.queueUpgrade(
      req.world, x, y, req.playerId, type,
    );
    if (schedule) await this.queue.schedule(schedule);
    return view;
  }
```

Analogicznie `recruit` (z `@Body() dto: RecruitDto`) i `cancel` (`@Delete(':x/:y/orders/:orderId')`, `@Param('orderId', ParseUUIDPipe)`), przy czym anulowanie zwraca widok wzbogacony o pole `lost`.

Planowanie zadania **po** zwróceniu z serwisu, czyli po zatwierdzeniu jego transakcji — to samo uzasadnienie co w przemiataniu.

- [ ] **Step 2: Uruchom testy**

Run: `npm run test:e2e`
Expected: PASS — pełny `test/orders.e2e-spec.ts`.

- [ ] **Step 3: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Expose upgrade, recruit and cancel routes behind the writable-world guard"
```

---

## Task 11: Limity zapytań w Redisie i zaufanie do proxy

**Files:**
- Modify: `src/infra/http/rate-limit.guard.ts`, `src/infra/http/rate-limit.guard.spec.ts`, `src/infra/http/configure-app.ts`
- Create: `test/rate-limit-shared.e2e-spec.ts`

**Interfaces:**
- Produces: `RateLimitGuard` liczy w Redisie zamiast w mapie w pamięci; te same klucze (`player:<id>`, `ip:<trasa>:<adres>`), te same zmienne konfiguracyjne, ten sam kod 429 i to samo ciało odpowiedzi. `configureApp` ustawia zaufanie do proxy z `TRUST_PROXY`.

- [ ] **Step 1: Napisz test wspólnego licznika**

`test/rate-limit-shared.e2e-spec.ts`: dwie instancje aplikacji zbudowane osobno przez `createTestApp`, wskazujące na ten sam Redis. Dziesięć nieudanych logowań rozłożonych po obu instancjach wyczerpuje **wspólny** budżet, a jedenaste, niezależnie od instancji, daje 429. Na mapie w pamięci każda instancja miałaby własny licznik i test padłby na 401 zamiast 429.

- [ ] **Step 2: Uruchom i potwierdź porażkę**

Run: `npm run test:e2e -- test/rate-limit-shared.e2e-spec.ts`
Expected: FAIL — `expected 429, got 401`.

- [ ] **Step 3: Przepisz licznik na Redisa**

Zastąp mapę w pamięci operacją `INCR` z `EXPIRE` ustawianym przy pierwszym trafieniu, w oknie stałym o długości sześćdziesięciu sekund. Zachowaj `@RateLimit('ip' | 'player')`, zachowaj wyliczanie klucza, zachowaj wyjście `true` dla tras bez metadanych i bez `playerId`. Usuń sprzątanie kubełków wraz z komentarzem o złożoności — wygasanie robi teraz Redis. Testy jednostkowe strażnika przepisz na podstawioną atrapę klienta Redisa, zachowując wszystkie dotychczasowe przypadki.

- [ ] **Step 4: Zaufanie do proxy**

W `configureApp`, przed ustawieniem prefiksu:

```ts
  if (env.TRUST_PROXY) {
    // Za odwrotnym proxy `req.ip` bez tego jest adresem proxy, więc limit po adresie
    // stałby się limitem globalnym dla wszystkich graczy naraz.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
  }
```

Zastąp blok ostrzegawczy w `rate-limit.guard.ts` krótką notką wskazującą tę zmienną.

- [ ] **Step 5: Uruchom testy, zweryfikuj mutacyjnie**

Run: `npm test && npm run test:e2e`
Expected: PASS. Mutant: przywróć mapę w pamięci obok Redisa i potwierdź, że test wspólnego licznika pada. Przywróć kod.

- [ ] **Step 6: Lint, build, commit**

```bash
npm run lint && npm run build && git add -A
git commit -m "Move rate limiting to Redis and make proxy trust configurable"
```

---

## Task 12: Dokumentacja i domknięcie

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-09-11-settlement-economy-design.md`

- [ ] **Step 1: Zaktualizuj README**

Dopisz: że testy e2e wymagają teraz dwóch kontenerów (Postgres i Redis); nowe zmienne środowiskowe wraz z tym, co robią; zdanie o tym, że worker domyślnie biegnie w procesie aplikacji i wyłącza się zmienną; ostrzeżenie, że wdrożenie za odwrotnym proxy wymaga włączenia zaufania do proxy.

- [ ] **Step 2: Zapisz odstępstwa i pozycje przedprodukcyjne**

Dopisz do specyfikacji sekcję odstępstw, jeśli implementacja gdziekolwiek od niej odeszła, oraz przenieś do sekcji pozycji przedprodukcyjnych wszystko, co w trakcie wykonania świadomie odłożono. Usuń z sekcji przedprodukcyjnej specu A (`2026-09-08-...-design.md`) trzy pozycje, które ten spec zamknął: limity zapytań w pamięci procesu, zaufanie do proxy oraz brak blokady przy wielu instancjach — zastępując je jednym zdaniem odsyłającym do specu B.

- [ ] **Step 3: Pełny przebieg i commit**

```bash
npm run lint && npm run build && npm test && npm run test:e2e
git add -A && git commit -m "Document the economy spec deviations and refresh the README"
```

---

## Samokontrola planu (wykonana przy pisaniu)

**Pokrycie specyfikacji:** sekcja 3 model danych → Task 2; sekcja 4 balans → Task 3; sekcja 5 materializacja → Task 5 i 7; sekcja 6 rozstrzyganie → Task 7 i 8; sekcja 7 API → Task 6, 9, 10; sekcja 8 praca u klienta → poza planem, celowo (repozytorium klienta); sekcja 9 testy → rozłożone w zadaniach, z weryfikacją mutacyjną w Task 7, 8 i 11; sekcja 10 wiele instancji → Task 8 (blokada) i Task 11 (limity, proxy); sekcja 11 testy → jw.; sekcja 12 kolejność prac → zachowana.

**Znane uproszczenia, do potwierdzenia przez wykonawcę:** Task 5 nie ma własnych testów, bo jego metody nie mają zachowania poza kontekstem transakcji i zlecenia — pokrywają je Task 7 i 9. Task 9 i 10 mają rozpisane listy przypadków testowych zamiast pełnego kodu każdego testu, bo wszystkie idą tym samym wzorcem co istniejący `test/settlements.e2e-spec.ts`; wykonawca ma go naśladować.
