# Islanders API — spec A: fundament, geografia, konta, światy i odczyty

Data: 2026-09-08
Status: zatwierdzony w brainstormingu, czeka na plan implementacji
Źródło decyzji: `docs/api-guidelines.md` (sekcje 1–7, 9–12). Ten dokument nie powtarza
uzasadnień z wytycznych; tam, gdzie od nich odstępuje, mówi to wprost.

Terminologia zgodna z `../islanders/CONTEXT.md` (w tym nowe terminy **Profile** i **Nickname**
oraz doprecyzowane Player, Home Settlement, Incoming Fleet i Round z sesji grillowania
2026-09-08). Gdzie klient i ten spec się różnią, wygrywa klient.

## 1. Cel i zakres

Pierwszy z trzech speców backendu. Dostarcza kroki 1–5 z sekcji 12 wytycznych plus limity
zapytań z kroku 10:

1. szkielet: konfiguracja, Drizzle, migracje, kontener z bazą, health;
2. geografia z testem zgodności na `contract/world-parity.json`;
3. konta i JWT;
4. światy, dołączanie, osada domowa;
5. odczyty: stan świata, osady z regułami informacyjnymi, mapa po prostokącie, floty.

Po wdrożeniu specu A klient może się zarejestrować, zalogować, dołączyć do świata, dostać
osadę domową na lądzie, pobrać stan świata, własne i cudze osady oraz (pustą) listę flot.

Poza zakresem A (specy B i C): rozbudowa budynków, rekrutacja, garnizon, wysyłka i
rozstrzyganie flot, kolonizacja, wyprawy, zmiany wiatru, Redis i BullMQ, logowanie zdarzeń
i metryki.

## 2. Podział na trzy specy

| Spec | Zakres | Zależy od |
|---|---|---|
| **A (ten)** | fundament, geografia, konta, światy, odczyty, limity | — |
| B | leniwe zasoby z materializacją, balans, rozbudowa, rekrutacja, garnizon | A |
| C | floty, kolejka BullMQ, rozstrzyganie, powrót, kolonizacja, wyprawy, atak binarny, wiatr | A, B |

Luki wytycznych, które zamykają kolejne specy: formuły kosztów i czasów (B), tabela
garnizonu (B), definicja binarnego wyniku ataku (C), częstotliwość zmian wiatru (C),
przenoszenie osady domowej po jej utracie na najstarszą pozostałą osadę (C).

## 3. Struktura kodu

Moduły Nest plus czysty rdzeń domenowy. W `src/domain/` nie ma dekoratorów Nest, importów
z `@nestjs/*`, Drizzle ani `Date.now()`; to zwykłe funkcje i typy, testowane bez kontenera.

```
src/
  domain/
    geography/      hashCell, hash01, lattice, smooth, valueNoise, fbm, islandAt, depositFor, constants
    rules/          RESOURCES, BIOMES, BUILDINGS, COMMON_BUILDINGS, biomeResources, extractionBuildings, slotsFor, buildingExtracts
    balance/        STARTING_BUILDINGS, STARTER_PACK, productionPerHour, capacityFor, populationMaxFor
    economy/        currentResources(stored, ratePerHour, lastSyncAt, now, capacity)
    time/           Clock (interfejs), toIso(date)
  infra/
    config/         schemat env (zod), ConfigModule
    db/             schema Drizzle (plik na tabelę), połączenie postgres.js, migrator
    http/           globalny prefix /api/v1, ValidationPipe, ServerTimeInterceptor, filtr wyjątków
  modules/
    health/         GET /health
    auth/           register, login, refresh, logout, JwtAuthGuard, @Public()
    players/        PlayersRepository
    worlds/         GET /worlds, GET /worlds/:id/state, POST /worlds/:id/join, ProfilesRepository, ProfileGuard, WorldWritableGuard, HomeIslandPicker
    settlements/    GET /worlds/:id/settlements[?bbox], SettlementViews
    fleets/         GET /worlds/:id/fleets, FleetViews
  cli/
    create-world.ts
drizzle/            migracje SQL z drizzle-kit, commitowane
test/               *.e2e-spec.ts (Testcontainers + supertest)
docker-compose.yml  Postgres 17 do pracy lokalnej
```

Każda jednostka odpowiada na trzy pytania: co robi, jak jej użyć, od czego zależy.
`domain/` zależy od niczego. `modules/` zależą od `domain/` i `infra/`. `infra/` nie zna
`modules/`.

## 4. Stos i konfiguracja

- Node 24, NestJS 12, TypeScript 6, ESM (`"type": "module"`, importy z `.js`).
- `drizzle-orm` + sterownik `postgres` (postgres.js), `drizzle-kit` do generowania migracji.
- `@nestjs/config` z walidacją przez `zod`. Zmienne:

| Zmienna | Domyślnie | Uwagi |
|---|---|---|
| `PORT` | `3000` | |
| `DATABASE_URL` | — | wymagana |
| `JWT_SECRET` | — | wymagana, min. 32 znaki |
| `JWT_ACCESS_TTL` | `15m` | |
| `JWT_REFRESH_TTL` | `30d` | |
| `ISLANDERS_CLIENT_DIR` | `../islanders` | tylko test parity |

- `@nestjs/jwt`, `argon2`, `@nestjs/throttler`, `@nestjs/terminus`, `class-validator`,
  `class-transformer`.
- Dev: `@testcontainers/postgresql`, `supertest`, `drizzle-kit`.
- `@nestjs/observe` z kluczami-wydmuszkami wypada z `AppModule`. Wraca w kroku 10, gdy
  będą prawdziwe klucze.

Migracje są generowane z definicji schematu (`npm run db:generate`), commitowane
w `drizzle/` i uruchamiane programowo migratorem Drizzle: `npm run db:migrate` lokalnie,
a w e2e na świeżym kontenerze przed startem aplikacji. Aplikacja nie migruje sama przy
starcie.

Skrypty npm: `db:generate`, `db:migrate`, `world:create`, plus istniejące `build`,
`start*`, `lint`, `test`, `test:e2e`.

## 5. Geografia (`domain/geography`)

Dosłowne przeniesienie załącznika do ADR 0001 i `scripts/core/WorldGrid.gd`.

### 5.1 Funkcje

```ts
hashCell(seed: number, x: number, y: number): number   // BigInt w środku, number na wyjściu
hash01(h: number): number                              // (h % 10007) / 10007
lattice(seed, ix, iy): number                          // hash01(hashCell(...)) * 2 - 1
smooth(t): number                                      // t*t*(3 - 2*t)
valueNoise(seed, x, y): number                         // Math.floor, nigdy trunc
fbm(seed, x, y, octaves): number                       // kolejność działań jak w kliencie
islandAt(seed, x, y): Island | null
depositFor(biome, h): Deposit                          // Record<Resource, number>, pusty = brak
```

`Island = { x, y, hash, biome, radius, deposit }`. `hash` to ta sama liczba, którą klient
trzyma jako `Island.seed_val`.

### 5.2 Wymagania wiążące

- `hashCell` liczy każdy krok (`&`, `*`, `^`, `>>`) na `BigInt`. Wejścia mogą być ujemne
  (współrzędne) i większe niż 31 bitów (`seed + i * 1013`); `BigInt` maskuje je jak
  64-bitowy `int` GDScriptu. Konwersja do `number` dopiero po ostatnim maskowaniu.
- `fbm` sumuje dokładnie w kolejności `total += amp * noise; norm += amp; amp *= 0.5;
  freq *= 2.0`.
- `depositFor` iteruje `RESOURCES` w kolejności `wood, stone, food, iron, sulfur`
  i używa `Math.trunc` tam, gdzie GDScript robi `int()`. Ilość jest liczbą całkowitą
  w `[200, 999]`.
- Stałe w `constants.ts`: `LAND_FREQUENCY 0.12`, `LAND_THRESHOLD 0.30`,
  `BIOME_FREQUENCY 0.03`, `BIOME_BAND 0.15`, `DEPOSIT_CHANCE 0.3`, `RADIUS_MIN 60`,
  `RADIUS_MAX 110`, sól oktawy `1013`, sole znaleziska `(7, 11)`, `(3, 5)`, `(1, 1)`,
  `(i + 1, 0)`.

### 5.3 Test zgodności

`src/domain/geography/world-parity.spec.ts`, w zestawie jednostkowym, bez bazy:

1. Czyta `${ISLANDERS_CLIENT_DIR}/contract/world-parity.json`. Brak pliku to porażka testu
   z komunikatem wskazującym zmienną, nigdy `skip`.
2. Porównuje blok `constants` z pliku z `constants.ts` (`toBe` na każdej stałej,
   `toEqual` na `resourceOrder`).
3. Dla każdego świata i każdej komórki liczy `land`, `biome`, `hashCell` i `islandAt`
   i porównuje `toBe` na `hash`, `land`, `biome`, `isIsland`, a dla wysp `biomeType`,
   `radius` oraz `toEqual` na `deposit`. Bez tolerancji.

Osobny `geography.spec.ts` trzyma cztery złote wiersze z sekcji 4.6 wytycznych, żeby błąd
był widoczny w sekundę. Ten test uruchamia się zawsze, także bez repozytorium klienta.

## 6. Reguły i balans

### 6.1 `domain/rules`

`as const` i typy wyprowadzone, żeby literówka w nazwie budynku była błędem kompilacji:

- `RESOURCES = ['wood', 'stone', 'food', 'iron', 'sulfur']`
- `BIOMES = ['TROPICAL', 'TEMPERATE', 'VOLCANIC']`
- `BUILDINGS = ['TOWN_HALL', 'BARRACKS', 'SHIPYARD', 'WAREHOUSE', 'SAWMILL', 'QUARRY',
  'FARM', 'IRON_MINE', 'SULFUR_PIT']`, `COMMON_BUILDINGS` to pierwsze cztery
- `biomeResources(biome)`: TROPICAL → wood, food; TEMPERATE → stone, food;
  VOLCANIC → iron, sulfur
- `extractionBuildings(biome)`: TROPICAL → SAWMILL, FARM; TEMPERATE → QUARRY, FARM;
  VOLCANIC → IRON_MINE, SULFUR_PIT
- `slotsFor(biome)` = wspólne + wydobywcze biomu, zawsze 6
- `buildingExtracts(building)`: SAWMILL → wood, QUARRY → stone, FARM → food,
  IRON_MINE → iron, SULFUR_PIT → sulfur; dla wspólnych `null`

### 6.2 `domain/balance` — wartości robocze

Jeden plik. Wszystkie liczby są placeholderami do kalibracji w specu B; B dopisze koszty
i czasy, nie zmieniając sygnatur.

| Co | Wartość |
|---|---|
| `STARTING_BUILDINGS` | TOWN_HALL 1, WAREHOUSE 1, oba wydobywcze biomu 1, BARRACKS 0, SHIPYARD 0 |
| `STARTER_PACK` | wood 500, stone 200, food 1000, iron 40, sulfur 0 (jednakowy dla biomów) |
| `BASE_RATE` na godzinę | SAWMILL 60, QUARRY 50, FARM 80, IRON_MINE 30, SULFUR_PIT 20 |
| `productionPerHour(biome, levels)` | dla każdego zasobu `BASE_RATE[budynek] * level`, zasób spoza biomu zawsze 0 |
| `capacityFor(levels)` | `500 + 1500 * WAREHOUSE` |
| `populationMaxFor(levels)` | `100 * TOWN_HALL` |

### 6.3 `domain/economy`

```ts
currentResources(stored, ratePerHour, lastSyncAt, now, capacity): Resources
// dla każdego zasobu: clamp(stored + rate * max(now - lastSyncAt, 0) / 3600, 0, capacity)
```

Ta sama formuła co `Settlement.current_resources` w kliencie. W A używana wyłącznie do
odczytu (bez zapisu); materializacja przy wydatkach należy do B.

### 6.4 Odstępstwo od wytycznych

Sekcja 6 wytycznych trzyma `capacity` i `population_max` jako kolumny `settlements`.
Oba wynikają z poziomów budynków, więc zgodnie z zasadą „w bazie tylko to, czego nie da się
wyliczyć” są liczone przy odczycie i **nie mają kolumn**. Unika to rozjazdu przy
rozbudowie magazynu w specu B.

## 7. Model danych

Typy wyliczeniowe Postgresa: `world_status`, `biome_type`, `building_type`, `mission_type`.

| Tabela | Klucz | Kolumny | Uwagi |
|---|---|---|---|
| `worlds` | `id serial` | `seed integer` CHECK `0 ≤ seed ≤ 2147483647`, `width`, `height`, `wind_x`, `wind_y` (`double precision`), `status world_status`, `created_at` | W JSON `id` jako string |
| `players` | `id serial` | `email citext` unikalny, `nickname citext` unikalny, `password_hash`, `created_at` | `ownerId` u klienta jest `int`; `nickname` to jedyna publiczna informacja o koncie |
| `profiles` | `(world_id, player_id)` | `home_x`, `home_y` (nullable), `joined_at` | Profile ze słownika; `NULL` w `home_*` oznacza profil bez osad (przenoszenie po stracie należy do C) |
| `settlements` | `(world_id, x, y)` | `owner_id`, `name`, `biome biome_type`, `wood, stone, food, iron, sulfur numeric(14,4)`, `population integer`, `last_sync_at timestamptz`, `founded_at` | bez `id`; indeks `(world_id, owner_id)` |
| `biome_buildings` | `(biome, type)` | — | 18 wierszy wstawianych migracją |
| `buildings` | `(world_id, x, y, type)` | `biome biome_type`, `level integer` CHECK `≥ 0` | klucze obce niżej |
| `fleets` | `id uuid` | `world_id`, `owner_id`, `mission`, `from_x`, `from_y`, `to_x`, `to_y`, `ships jsonb`, `cargo jsonb`, `depart_at`, `arrive_at`, `resolved_at` | tworzona w A, zapisywana od C |
| `deposits_taken` | `(world_id, x, y)` | `wood … sulfur numeric(14,4)` | tworzona w A, używana od C |
| `refresh_tokens` | `id uuid` | `player_id`, `token_hash`, `expires_at`, `revoked_at` | indeks `token_hash` |

Wszystkie klucze obce z `ON DELETE CASCADE` od `worlds` i `players` w dół. Pierwsza migracja
włącza rozszerzenie `citext` (`CREATE EXTENSION IF NOT EXISTS citext`).

**Biom w bazie.** `settlements.biome` jest wyliczalny z seeda, ale przechowywany celowo:
jest niezmienny, więc nie grozi rozjazdem, a umożliwia deklaratywne egzekwowanie reguły
„budynek zgodny z biomem” bez triggerów:

- `buildings(world_id, x, y, biome)` → FK do `settlements(world_id, x, y, biome)`
  (kolumny unikalne, bo zawierają klucz główny), więc `buildings.biome` nie może kłamać;
- `buildings(biome, type)` → FK do `biome_buildings`, więc `SAWMILL` na `VOLCANIC` odrzuca
  Postgres.

**Nie w bazie:** ląd i morze, promień, pierwotne znalezisko, produkcja, pojemność, limit
populacji.

## 8. Uwierzytelnianie

| Endpoint | Ciało | Odpowiedź |
|---|---|---|
| `POST /auth/register` | `{ email, nickname, password }` | `201 { playerId, nickname, accessToken, refreshToken }` |
| `POST /auth/login` | `{ email, password }` | `200 { playerId, nickname, accessToken, refreshToken }` |
| `POST /auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` |
| `POST /auth/logout` | `{ refreshToken }` | `204` |

- Access token: JWT HS256, `sub = playerId`, ważny `JWT_ACCESS_TTL`.
- Refresh token: 32 losowe bajty base64url; w bazie tylko SHA-256; ważny `JWT_REFRESH_TTL`.
  `refresh` rotuje: stary wiersz dostaje `revoked_at`, powstaje nowy. **Okno łaski 60 s:**
  token unieważniony rotacją mniej niż 60 s temu jest nadal akceptowany i rotuje ponownie,
  bo na telefonie odpowiedź z nową parą regularnie ginie po drodze; niedoręczona para wygasa
  sama. Po oknie zwykłe 401, bez unieważniania pozostałych tokenów gracza. Wiele urządzeń
  to wiele równoległych wierszy.
- Hasło min. 8 znaków; argon2id z domyślnymi parametrami biblioteki. E-mail i pseudonim
  porównywane bez rozróżniania wielkości liter (`citext`).
- `nickname`: 3–20 znaków, litery, cyfry, `_` i `-`, po przycięciu białych znaków. Wymagany
  przy rejestracji, bez zmiany w A. Zwracany innym graczom jako `ownerName`.
- Zajęty e-mail lub pseudonim → 409 z polem `field` w komunikacie. Złe dane logowania → 401
  bez ujawniania, czy konto istnieje.
- Konto to wyłącznie e-mail i hasło; kont anonimowych i dostawców zewnętrznych nie ma w A.

**Strażnicy.** `JwtAuthGuard` globalny, wyłączany `@Public()` na `/auth/*` i `/health`.
`ProfileGuard` na wszystkim pod `/worlds/:id/` poza `join`: 404 gdy świat nie istnieje,
403 gdy brak wiersza `profiles`; dopina `{ world, playerId, profile }` do żądania. Nie
sprawdza statusu świata, bo odczyt działa na każdym statusie.
`WorldWritableGuard` przepuszcza tylko światy `OPEN` i `CLOSED`, na `ENDED` zwraca 409.
W A nie ma jeszcze trasy, która go potrzebuje; powstaje z testem jednostkowym na trzech
statusach, a specy B i C zakładają go na każdym zapisie.

## 9. Światy i dołączanie

| Endpoint | Odpowiedź |
|---|---|
| `GET /worlds` | `[{ id, seed, size: {w, h}, wind: {x, y}, status, joined }]` |
| `GET /worlds/:id/state` | `{ id, seed, size, wind, status, playerId, homeSettlement: {x, y} \| null, serverTime }` |
| `POST /worlds/:id/join` `{ name? }` | `201` pełna osada domowa (sekcja 10.2) + `serverTime` |

`join`: świat musi być `OPEN` (inaczej 409; `CLOSED` nie przyjmuje nowych profili, gra
trwa); powtórne dołączenie tym samym kontem → 409, a klient po 409 woła `state`, żeby
poznać osadę domową; `name` domyślnie „Osada”, 1–32 znaki po przycięciu białych znaków.
`homeSettlement` w `state` jest `null` dla profilu bez osad; w A nie da się tego osiągnąć,
ale klient ma to obsłużyć, bo spec C przenosi wskaźnik po utracie osady domowej.

### 9.1 Wybór wyspy domowej (`HomeIslandPicker`)

Czysta funkcja `pickHomeIsland(world, isTaken: (x, y) => boolean, random)`:

1. Środek `(floor(w/2), floor(h/2))`.
2. Dla `r = 0, 1, 2, …` aż do pokrycia całej mapy: komórki pierścienia Czebyszewa o promieniu
   `r`, w granicach mapy, dla których `islandAt` daje wyspę o biomie `TROPICAL` lub
   `TEMPERATE`, i `!isTaken(x, y)`.
3. Pierwszy pierścień z co najmniej jedną kandydatką wygrywa; z niego losowana jest jedna
   (`crypto.randomInt`).
4. Brak kandydatek → `null`, a endpoint zwraca 409 „świat pełny”.

Zapis w jednej transakcji: `profiles`, `settlements` (pakiet startowy,
`last_sync_at = now`, `population 0`), sześć wierszy `buildings` ze `STARTING_BUILDINGS`.
Naruszenie klucza `settlements` (dwa równoległe `join` wylosowały tę samą wyspę) cofa
transakcję i powtarza od kroku 1, maksymalnie trzy razy; potem 409.

### 9.2 Tworzenie świata

`npm run world:create -- --seed 1337 --width 200 --height 200 --wind 0.3,-0.1`.
Standalone application context Nest, walidacja seeda w 31 bitach, wstawienie wiersza
ze statusem `OPEN`, wypisanie `id`. Bez endpointu HTTP.

## 10. Odczyty i reguły informacyjne

### 10.1 Endpointy

| Endpoint | Odpowiedź |
|---|---|
| `GET /worlds/:id/settlements` | `[ownView…]` własne osady |
| `GET /worlds/:id/settlements?bbox=x1,y1,x2,y2` | osady w prostokącie: własne `ownView`, cudze `publicView` |
| `GET /worlds/:id/fleets` | własne floty w pełni + cudze `ATTACK` na własne osady jako `incomingView` |

`bbox` domknięty, w granicach mapy, powierzchnia ≤ 4096 komórek; inaczej 400. Listy są
gołymi tablicami, bo klient ma `fetch_settlements() -> Array` i `fetch_fleets() -> Array`.

### 10.2 Widoki osady (`SettlementViews`)

Wybór widoku w jednym miejscu: `viewFor(row, buildings, requesterId, now)`.

`publicView(row)`:

```json
{ "world": "1", "x": 81, "y": 73, "ownerId": 9, "ownerName": "szara_skala", "name": "Szara Skała" }
```

Bez klucza `resources` — jego brak jest dla klienta sygnałem osady cudzej. `ownerName` to
`players.nickname` właściciela, dołączany złączeniem w tym samym zapytaniu.

`ownView(row, buildings, now)` — kształt z sekcji 4.2 specu klienta:

```json
{
  "world": "1", "x": 80, "y": 73, "ownerId": 7, "ownerName": "sebastian", "name": "Koralowa",
  "resources": { "wood": 500, "stone": 200, "food": 1000, "iron": 40, "sulfur": 0 },
  "productionPerHour": { "wood": 60, "stone": 0, "food": 80, "iron": 0, "sulfur": 0 },
  "capacity": 2000, "population": 0, "populationMax": 100,
  "buildings": { "TOWN_HALL": 1, "BARRACKS": 0, "SHIPYARD": 0, "WAREHOUSE": 1, "SAWMILL": 1, "FARM": 1 },
  "lastSyncAt": "2026-09-08T12:00:00.000Z"
}
```

`resources` to `currentResources` na `now` (bez zapisu do bazy), `lastSyncAt = now`.
`buildings` zawsze wszystkie sześć slotów `slotsFor(biome)`, także z poziomem 0.

### 10.3 Widoki floty (`FleetViews`)

`ownView` to pełny kształt z sekcji 4.3 specu klienta. `incomingView` to
`{ id, world, ownerId, ownerName, mission, from, to, departAt, arriveAt }` bez `ships`
i `cargo`. `departAt` jest celowo widoczny: bez niego klient rysuje wrogą flotę już na celu
(`Fleet.progress()` daje 1.0), a wyciek to wyłącznie klasa prędkości, nie skład. Słownik
Incoming Fleet mówi to wprost.
Zapytanie: `owner_id = :me OR (mission = 'ATTACK' AND (to_x, to_y) IN (osady gracza))`,
`resolved_at IS NULL`. W A tabela jest pusta; zapytanie i projekcje są pokryte e2e na
wierszach wstawionych bezpośrednio do bazy.

### 10.4 Czas

`Clock` wstrzykiwalny (`now(): Date`); produkcja `Date.now()`, testy sterowany. Wszystkie
znaczniki przez `toISOString()` (klient obcina ułamki sekund, to potwierdzone testem
`test_parse_iso8601_with_milliseconds`). `ServerTimeInterceptor` dodaje nagłówek
`X-Server-Time` do każdej odpowiedzi i pole `serverTime` do każdej odpowiedzi będącej
obiektem; tablice zostają tablicami.

### 10.5 Limity

`@nestjs/throttler`, magazyn w pamięci procesu (Redis dojdzie w C):

- trasy uwierzytelnione: 120 żądań / minutę na `playerId`;
- `register`, `login`, `refresh`: 10 żądań / minutę na adres IP.

Przekroczenie → 429.

## 11. Błędy

Koperta Nest `{ statusCode, error, message }`.

| Kod | Kiedy |
|---|---|
| 400 | walidacja DTO, zły `bbox` |
| 401 | brak, zły lub wygasły token; refresh token unieważniony ponad 60 s temu; złe dane logowania |
| 403 | gracz nie jest członkiem świata |
| 404 | świat nie istnieje |
| 409 | zajęty e-mail lub pseudonim; powtórne dołączenie; `join` do świata nie `OPEN`; świat pełny; zapis na świecie `ENDED` (`WorldWritableGuard`) |
| 429 | limit zapytań |
| 500 | błąd bazy lub nieoczekiwany wyjątek; szczegóły tylko w logu z identyfikatorem żądania |

## 12. Testy

Twierdzenie bez wyjścia komendy nie jest dowodem.

**Jednostkowe** (`npm test`, `**/*.spec.ts`, bez bazy):

- geografia: cztery złote wiersze; pełny parity 80 000 komórek; `hashCell` dla ujemnych
  współrzędnych i dla seeda powyżej 31 bitów; przypadek `(1337, 103, 100) = 252586155`;
- reguły: każdy biom ma dokładnie 2 zasoby i 2 budynki wydobywcze; `slotsFor` ma 6;
- balans: produkcja zasobu spoza biomu to 0; pojemność i limit populacji dla poziomów 0–3;
- `currentResources`: 0 h, 2 h, obcięcie do pojemności, ujemna delta, brak produkcji;
- `SettlementViews`: `publicView` nie ma klucza `resources`; `ownView` ma 6 slotów;
- `FleetViews`: `incomingView` bez `ships` i `cargo`, z `departAt` i `ownerName`;
- `WorldWritableGuard`: przepuszcza `OPEN` i `CLOSED`, odrzuca `ENDED` z 409;
- `SettlementViews`: `ownerName` obecny w obu widokach;
- `pickHomeIsland`: fałszywy `isTaken`, sprawdzenie biomu, granic mapy, pierścienia,
  `null` dla pełnej mapy.

**E2E** (`npm run test:e2e`, `**/*.e2e-spec.ts`, jeden kontener Postgres z Testcontainers
na cały przebieg, migracje przed startem, `supertest`):

- auth: rejestracja z pseudonimem, logowanie, rotacja refresh tokenu, reuse w oknie łaski
  → 200 z nową parą (zegar sterowany), reuse po oknie → 401 bez unieważniania pozostałych
  urządzeń, logout, zajęty e-mail → 409, zajęty pseudonim inną wielkością liter → 409;
- świat: `world:create` przez serwis, `join` daje osadę, dla której `islandAt` zwraca wyspę
  `TROPICAL` lub `TEMPERATE`, z budynkami startowymi; powtórny `join` → 409;
  `join` do świata `CLOSED` → 409; `GET /worlds/:id/state` bez członkostwa → 403;
- reguły informacyjne: dwa konta na jednym świecie; `bbox` obejmujący obie osady zwraca
  własną z `resources`, cudzą bez tego klucza, obie z `ownerName`; `GET /worlds/:id/settlements`
  bez bbox zwraca tylko własne;
- `bbox` o powierzchni > 4096 → 400;
- floty: wiersz `ATTACK` wstawiony SQL-em na osadę gracza jest widoczny dla celu bez
  `ships` i `cargo`, a wiersz `TRANSPORT` cudzy nie jest widoczny;
- `X-Server-Time` na każdej odpowiedzi, `serverTime` w `state` i `join`;
- 429 po przekroczeniu limitu `login`;
- baza: `INSERT` do `buildings` z `SAWMILL` na osadzie `VOLCANIC` kończy się błędem klucza
  obcego.

## 13. Kolejność implementacji

1. Konfiguracja env, `docker-compose.yml`, Drizzle, schema, pierwsza migracja, health,
   usunięcie `@nestjs/observe` z `AppModule`, e2e z Testcontainers przechodzący na `/health`.
2. `domain/geography` ze złotymi wierszami, potem pełny parity. **Dopóki parity nie jest
   zielony, nic wyżej nie powstaje.**
3. `domain/rules`, `domain/balance`, `domain/economy`, `domain/time`.
4. `auth` i `players` z e2e.
5. `worlds`: lista, `state`, `ProfileGuard`, `WorldWritableGuard`, `HomeIslandPicker`, `join`,
   `world:create`.
6. `settlements`: widoki, odczyt własnych i po `bbox`, e2e reguł informacyjnych.
7. `fleets`: zapytanie i projekcje, e2e na wierszach z SQL.
8. `ServerTimeInterceptor`, throttler, filtr błędów, e2e nagłówka i 429.

## 14. Praca po stronie klienta wynikająca z tego specu

Nie jest częścią A, ale wynika z niego i powinna trafić do zaległości klienta:

- `HttpProvider` ma dziś ścieżki `/world`, `/settlements`, `/fleets` bez uwierzytelnienia;
  docelowo `/api/v1/worlds/:id/state`, `/api/v1/worlds/:id/settlements?bbox=`,
  `/api/v1/worlds/:id/fleets` z nagłówkiem `Authorization: Bearer`.
- `serverTime` czytany ze `state`; opcjonalnie z nagłówka `X-Server-Time`.
