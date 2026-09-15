# Islanders — etap 2: core jednego świata

Data: 2026-09-14
Status: zatwierdzony w brainstormingu, czeka na plan implementacji
Nadrzędny: `docs/superpowers/specs/2026-09-13-architecture-split-design.md` (spec 0), etap 2.
Architektura: `docs/architecture.md`. Decyzje: ADR 0005, 0006, 0007.
Poprzednik: `docs/superpowers/specs/2026-09-13-stage-1-monorepo-and-auth-design.md` (wdrożony, PR #1),
poprawka kolejności blokad w auth (PR #2) — gałąź etapu 2 wychodzi z `main` po scaleniu #2.
Terminologia: `../islanders/CONTEXT.md`.

## 1. Cel i zakres

Po etapie 2 `apps/core` obsługuje dokładnie jeden świat: nie ma `world_id` w żadnej tabeli ani
trasie, nie ma własnych kont, weryfikuje tokeny wydane przez auth kluczem publicznym, ma port
wewnętrzny z health i szkieletem API admina, zgłasza się do rejestru auth i wysyła zdarzenia przez
outbox. Działa w rolach `all`, `api` i `worker`.

Geografia nadal liczy się z seeda (etap 3 ją zastąpi), więc seed, wymiary i wiatr zostają w danych
świata i w odpowiedzi `GET /v1/world`.

Poza zakresem: generacja mapy i `islands` (etap 3), pogoda (etap 4), kolejki zleceń i workery
BullMQ (etap 5), ekrany tools (etap 6), floty w ruchu (etap 7), zamrożenie profilu, zmiana
pseudonimu.

## 2. Rozstrzygnięcia

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | Skąd core zna swój świat przed etapem 3 | Tabela `world_settings` z jednym wierszem; `world:init` zamiast `world:create`; `WORLD_SLUG` z env tylko weryfikuje zgodność przy starcie |
| 2 | Start repliki przy niedostępnym auth | Ostatni poprawny JWKS zapisany we własnym Redisie świata (`auth:jwks`, TTL 7 dni), wspólny dla replik |
| 3 | Podział ról procesu | `CORE_ROLE=all\|api\|worker` od razu; zastępuje `WORKER_ENABLED` |
| 4 | Świat bez profilu gracza | `GET /v1/world` działa bez profilu (`profile: null`); osady, floty i zapisy wymagają profilu |
| 5 | Przejścia statusu świata | Każde przejście możliwe; poza naturalnym porządkiem `DRAFT → OPEN → CLOSED → ENDED` wymaga `--force`; przejście do `DRAFT` zabronione, gdy istnieje choć jeden profil |
| 6 | Widoczność świata `DRAFT` | Na porcie publicznym tylko dla ról `tester` i `admin`; pozostali gracze dostają 404 na każdej trasie |

## 3. Dane

Migracje core zaczynają się od zera: usunięcie `apps/core/drizzle/0000–0002` i nowy zestaw
`0000_citext_extension`, `0001_initial_schema`, `0002_seed_biome_buildings` (18 wierszy jak dotąd).

| Tabela | Klucz | Kolumny | Uwagi |
|---|---|---|---|
| `world_settings` | `id smallint` z CHECK `id = 1` | `slug text`, `name text`, `status world_status` (`DRAFT`, `OPEN`, `CLOSED`, `ENDED`), `is_test boolean`, `seed integer` (CHECK 0 ≤ seed ≤ 2147483647), `width integer`, `height integer`, `wind_x double precision`, `wind_y double precision`, `created_at`, `updated_at` | slug zgodny z `worldSlugSchema` |
| `profiles` | `player_id uuid` | `nickname citext` unikalny, `home_x`, `home_y` (nullable), `joined_at` | pseudonim kopiowany z tokenu przy dołączeniu |
| `settlements` | `(x, y)` | `owner_id uuid` → `profiles.player_id` cascade, `name`, `biome`, zasoby `numeric(14,4)`, `population`, `last_sync_at`, `founded_at` | unikalne `(x, y, biome)`; indeks `owner_id` |
| `biome_buildings` | `(biome, type)` | — | bez zmian |
| `buildings` | `(x, y, type)` | `biome`, `level` | FK `(x, y, biome)` → `settlements`, FK `(biome, type)` → `biome_buildings` (ADR 0001 API) |
| `fleets` | `id uuid` | `owner_id uuid` → `profiles.player_id` cascade, misja, trasa, `ships`, `cargo`, `depart_at`, `arrive_at`, `resolved_at` | indeksy `owner_id` i `(to_x, to_y)` |
| `deposits_taken` | `(x, y)` | zasoby zabrane | znika w etapie 3 |
| `outbox` | `id uuid` | `type text`, `payload jsonb`, `created_at`, `sent_at`, `attempts integer` domyślnie 0, `next_attempt_at`, `last_error text` | indeks częściowy na `created_at` gdzie `sent_at IS NULL` |

Znikają `worlds`, `players`, `refresh_tokens`.

**Weryfikacja przy starcie aplikacji:** brak wiersza `world_settings` → błąd startu z komunikatem
„uruchom world:init”; `world_settings.slug ≠ WORLD_SLUG` → błąd startu. Nie dotyczy komend
`db:migrate` i `world:init`.

## 4. Tożsamość i dostęp

### 4.1 JWKS

`JwksProvider`:

1. przy starcie czyta `auth:jwks` z Redisa świata i jeśli jest, używa go od razu;
2. w tle pobiera `GET {AUTH_INTERNAL_URL}/.well-known/jwks.json` (timeout 2 s) i po każdym
   udanym pobraniu zapisuje `auth:jwks` z TTL 7 dni;
3. odświeża co godzinę oraz przy tokenie z nieznanym `kid`, nie częściej niż raz na 30 s;
4. gdy kluczy nie ma ani w pamięci, ani w Redisie, trasy wymagające tokenu zwracają 503
   „Usługa kont niedostępna”; `/health/ready` pozostaje 200.

### 4.2 Strażnicy

- `PlayerTokenGuard` (globalny na trasach gracza): `jwtVerify` z `algorithms: ['EdDSA']`,
  `issuer: AUTH_ISSUER`, `audience: islanders-worlds`, a potem `worldsAccessClaimsSchema`.
  Ustawia `req.player = { id, roles, nickname }` i `req.rateLimitSubject = player:<id>`.
  Na świecie z `is_test` wymaga roli `tester` albo `admin` (403). Na świecie w statusie `DRAFT`
  gracz bez roli `tester` albo `admin` dostaje 404 „Świat nie istnieje” (słownik: `DRAFT` jest
  niewidoczny dla graczy poza testerami).
- `ProfileGuard`: profil `req.player.id` musi istnieć (403); dopina `req.profile` i `req.world`.
- `WorldWritableGuard`: zapis odrzucany (409) przy `DRAFT` i `ENDED`.
- `ToolsTokenGuard` (API admina): `audience: islanders-tools`, rola `admin` (403).

### 4.3 Trasy gracza (port publiczny, bez prefiksu `api`)

| Trasa | Profil | Odpowiedź |
|---|---|---|
| `GET /v1/world` | niewymagany | `{ slug, name, status, isTest, seed, size: { w, h }, wind: { x, y }, profile: { playerId, homeSettlement: { x, y } \| null } \| null, serverTime }` |
| `POST /v1/join` `{ name? }` | nie może istnieć (409) | `201` pełna osada domowa + `serverTime`; tylko przy `OPEN` (409); profil z `nickname` z tokenu; `PlayerJoinedWorld` w outboxie w tej samej transakcji; losowanie wyspy domowej i ponowienia jak w specu A §9.1 |
| `GET /v1/settlements[?bbox=]` | wymagany | jak dotąd; `ownerId` uuid, `ownerName` z `profiles.nickname`; reguły informacyjne bez zmian |
| `GET /v1/fleets` | wymagany | jak dotąd; `ownerId` uuid |

Swagger (gdy włączony) pod `/docs`. Znikają moduły `auth` i `players`, `JwtAuthGuard`, trasy
`/api/v1/auth/*`, `/api/v1/worlds*` i `/api/v1/health`.

## 5. Porty, role i API admina

| `CORE_ROLE` | port publiczny `PORT` (3100) | port wewnętrzny `ADMIN_PORT` (3101) | prace w tle |
|---|---|---|---|
| `all` (domyślnie) | trasy gracza | `/health/*`, `/admin/v1/*` | wysyłacz outboxa, zgłoszenie świata |
| `api` | trasy gracza | `/health/*`, `/admin/v1/*` | brak |
| `worker` | nie nasłuchuje | `/health/*` | wysyłacz outboxa, zgłoszenie świata |

Zakres portów pilnuje `portScopeMiddleware` z `@islanders/platform` (prefiksy wewnętrzne
`/health`, `/admin`). `/health/ready` sprawdza Postgres i Redis świata, nigdy auth.

API admina w etapie 2: `GET /admin/v1/world` → `{ settings, profiles: <liczba>, settlements:
<liczba>, outbox: { pending: <liczba>, oldestPendingAt: <ISO> | null } }`.

## 6. Komunikacja z auth

### 6.1 Klient auth

- Token serwisowy: `POST {AUTH_INTERNAL_URL}/internal/v1/token` z `AUTH_CLIENT_ID` i
  `AUTH_CLIENT_SECRET`; przechowywany w pamięci i odnawiany 60 s przed wygaśnięciem.
- Każde wywołanie: timeout 2 s.
- Circuit breaker: 5 kolejnych błędów (sieć, timeout, 5xx) otwiera obwód na 30 s; po tym czasie
  jedno żądanie próbne; sukces zamyka obwód.

### 6.2 Zgłoszenie świata

W rolach `all` i `worker` po starcie: `PUT /internal/v1/worlds/{slug}` z `name`, `status`,
`isTest` z `world_settings` oraz `publicUrl = PUBLIC_URL`, `adminUrl = ADMIN_URL`. Przy błędzie
ponawiane w tle z backoffem 2 s–5 min z jitterem; start aplikacji nie czeka na sukces.

### 6.3 Outbox

- Zdarzenia (schematy z `@islanders/contracts`): `PlayerJoinedWorld` przy dołączeniu,
  `WorldStatusChanged` przy zmianie statusu — zapisywane w tej samej transakcji co zmiana.
- Wysyłacz (role `all` i `worker`): cykl co 2 s pod blokadą doradczą (`withAdvisoryLock`);
  pobiera do 100 najstarszych niewysłanych wierszy, których `next_attempt_at` minął lub jest
  pusty, w kolejności `created_at`, i wysyła jedną partią `POST /internal/v1/events`.
- 200 → `sent_at = now` dla całej partii.
- Błąd sieci, timeout, 5xx, 409 (świat niezgłoszony) → dla najstarszego wiersza `attempts + 1`,
  `next_attempt_at` = backoff wykładniczy 2 s–5 min z jitterem, `last_error`; kolejne wiersze
  czekają (kolejność w obrębie świata).
- 400, 401, 403 → jak wyżej, dodatkowo log na poziomie `error` (ponawianie nie pomoże bez zmiany
  kodu albo konfiguracji).
- Brak limitu prób. Ostrzeżenie w logu, gdy najstarszy niewysłany wiersz ma ponad 15 min.
- Wysłane wiersze starsze niż 7 dni są usuwane w cyklu wysyłacza.

## 7. CLI

Kontekst aplikacji bez serwerów HTTP i bez prac w tle.

| Komenda | Działanie |
|---|---|
| `world:init --slug <s> --name <n> --seed <int> --width <int> --height <int> [--wind x,y] [--test]` | zakłada `world_settings` ze statusem `DRAFT`; błąd, gdy świat już istnieje |
| `world:open [--force]` | status `OPEN` |
| `world:close [--force]` | status `CLOSED` |
| `world:end [--force]` | status `ENDED` |
| `world:status` | ustawienia świata i stan outboxa |

Przejścia bez `--force`: `DRAFT → OPEN`, `OPEN → CLOSED`, `CLOSED → ENDED`. Każde inne przejście
wymaga `--force` i drukuje ostrzeżenie; ustawienie tego samego statusu to błąd. Przejście do
`DRAFT` jest odrzucane (także z `--force`), gdy istnieje choć jeden profil — `DRAFT` to świat
przygotowywany, zanim ktokolwiek do niego dołączył, a od etapu 3 status, w którym wolno
nadpisać mapę. Zmiana statusu i
wpis `WorldStatusChanged` w outboxie w jednej transakcji.

## 8. Konfiguracja

`baseEnvShape` z `@islanders/platform` plus: `ADMIN_PORT` (domyślnie 3101), `WORLD_SLUG`,
`PUBLIC_URL`, `ADMIN_URL`, `AUTH_INTERNAL_URL`, `AUTH_ISSUER`, `AUTH_CLIENT_ID`,
`AUTH_CLIENT_SECRET`, `CORE_ROLE` (`all` domyślnie), `ISLANDERS_CLIENT_DIR` (do etapu 3).
`PORT` w `.env.example` = 3100. Znikają `JWT_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
`WORKER_ENABLED`, `SWEEP_INTERVAL_MS`.

## 9. Testy

**Jednostkowe:** przejścia statusu (naturalne, wymuszone, ten sam status, `DRAFT` przy
istniejących profilach odrzucone także z `--force`); backoff outboxa
(granice 2 s i 5 min, jitter w zakresie); circuit breaker (otwarcie po 5 błędach, próba po 30 s,
zamknięcie po sukcesie); limit odświeżania JWKS przy nieznanym `kid`; widok `GET /v1/world`
z profilem, bez profilu i z profilem bez osady domowej.

**E2E core** (Testcontainers; bez prawdziwego auth):

- harness generuje parę kluczy EdDSA, podpisuje tokeny gracza i tools oraz stawia **fałszywy
  auth** — lokalny serwer HTTP z JWKS, `/internal/v1/token`, `/internal/v1/worlds/:slug`,
  `/internal/v1/events`, walidujący przyjmowane ciała schematami z `@islanders/contracts` i
  zapisujący żądania do asercji;
- przeniesione testy osad, flot, warstwy HTTP i schematu na nowych trasach i uuid (reguły
  informacyjne, bbox, `X-Server-Time`, limiter po adresie i po graczu);
- `GET /v1/world` bez profilu → `profile: null`; dołączenie → pełna osada i `PlayerJoinedWorld`
  dostarczone do fałszywego auth; drugie dołączenie → 409; `DRAFT` i `CLOSED` → 409 na `join`;
- świat testowy bez roli `tester` → 403;
- świat `DRAFT`: gracz bez roli → 404 na `GET /v1/world` i `POST /v1/join`; `tester` → 200 na
  `GET /v1/world`;
- token tools na trasie gracza → 401; token gracza na `/admin/v1/world` → 401; `admin` → 200;
- `/health/*` i `/admin/*` na porcie publicznym → 404;
- zmiana statusu przez serwis CLI → `WorldStatusChanged` dostarczone; zgłoszenie świata przy
  starcie dociera do `PUT /internal/v1/worlds/:slug`.

**E2E awarii:**

- fałszywy auth zatrzymany: gracz z ważnym tokenem → 200, `/health/ready` → 200; dołączenie
  zapisuje zdarzenie, które dociera po wznowieniu fałszywego auth;
- świeża aplikacja z JWKS tylko w Redisie i zatrzymanym auth weryfikuje tokeny;
- bez JWKS w Redisie i bez auth → 503 na trasie gracza;
- `CORE_ROLE=api` nie wysyła outboxa; `CORE_ROLE=worker` nie nasłuchuje na porcie publicznym;
- start z niezgodnym `WORLD_SLUG` → błąd.

## 10. Praca po stronie klienta Godot

1. Logowanie i odświeżanie tokenów przez auth; lista światów z `GET /v1/worlds` w auth.
2. Adres świata z `publicUrl`; trasy `/v1/world`, `/v1/join`, `/v1/settlements`, `/v1/fleets`.
3. `playerId`, `ownerId` jako uuid (string).
4. Obsługa `profile: null` w `GET /v1/world` (ekran dołączenia).

## 11. Zmiany w dokumentacji

- `docs/architecture.md`: §4.3 i §8 — JWKS w Redisie świata; §5.1 — `world_settings` z seedem,
  wymiarami i wiatrem do etapu 3; §5.2 — `world:init` przed etapem 3 i przejścia statusu z
  `--force`; §6 — semantyka ról `all`/`api`/`worker`.
- Spec 0 §4, etap 2 — odnośnik do tego specu.
- `README.md` i `apps/core/.env.example` pod nową konfigurację i komendy.

## 12. Kolejność prac

1. Schemat od zera, `world_settings`, weryfikacja przy starcie, `world:init`, komendy statusu
   (bez outboxa — zapis zdarzeń dochodzi w kroku 5).
2. Konfiguracja i `CORE_ROLE`; dwa porty, `portScopeMiddleware`, health z platformy.
3. `JwksProvider`, strażnicy, trasy `/v1/*`; usunięcie modułów kont; fałszywy auth w harnessie.
4. `ToolsTokenGuard` i `GET /admin/v1/world`.
5. Klient auth z circuit breakerem, zgłoszenie świata, outbox i wysyłacz; zdarzenia z `join` i
   zmian statusu.
6. Testy awarii, `.env.example`, README, poprawki w architekturze.
