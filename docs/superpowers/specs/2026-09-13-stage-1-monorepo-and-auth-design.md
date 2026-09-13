# Islanders — etap 1: monorepo i usługa auth

Data: 2026-09-13
Status: zatwierdzony w brainstormingu, czeka na plan implementacji
Nadrzędny: `docs/superpowers/specs/2026-09-13-architecture-split-design.md` (spec 0), etap 1.
Architektura: `docs/architecture.md`. Decyzje: ADR 0005, 0007.
Materiał źródłowy: spec A §8 (logika tokenów), §15.1 (pozycje przedprodukcyjne).

## 1. Cel i zakres

Po etapie 1 repozytorium jest monorepo z trzema pakietami i dwiema aplikacjami, a usługa
`auth` działa samodzielnie: rejestruje i loguje konta, wydaje tokeny EdDSA weryfikowalne przez
JWKS, prowadzi rejestr światów i przyjmuje zdarzenia od światów.

`apps/core` to dotychczasowy kod **bez zmiany zachowania** — nadal ma własne trasy `/auth/*`,
HS256 i `world_id`. Usuwa je etap 2.

Poza zakresem: weryfikacja e-maila, reset hasła, lista sesji i wylogowanie ze wszystkich
urządzeń, kanał unieważnień, `apps/tools`, zmiany w core poza przeniesieniem kodu do pakietów.

## 2. Rozstrzygnięcia

| # | Pytanie | Decyzja |
|---|---|---|
| 1 | Wspólna infrastruktura Nest | `packages/platform` zależny od Nest i Drizzle; `domain` i `contracts` bez frameworka |
| 2 | Konsumpcja pakietów | Build `tsc -b` do `dist`, pole `exports` na `dist`; Vitest w pakietach na źródłach |
| 3 | Zakres kont | Jak dziś (e-mail, pseudonim, hasło) plus role, blokada konta i CLI technika |
| 4 | Nadawanie ról | Wyłącznie CLI; każde nowe konto ma `player` |
| 5 | Biblioteka JWT | `jose` zamiast `@nestjs/jwt`: EdDSA, JWKS, `createRemoteJWKSet` dla core |
| 6 | Klienci serwisowi | W konfiguracji (`SERVICE_CLIENTS`), nie w bazie — sekret K8s, bez stanu |
| 7 | Porty auth | Publiczny `:3000`, wewnętrzny `:3001` — ten sam układ co core |

## 3. Monorepo

### 3.1 Układ

```
package.json              workspaces: ["apps/*", "packages/*"], skrypty zbiorcze
tsconfig.base.json        wspólne opcje kompilatora (nodenext, ES2023, dekoratory, strict)
oxlint.json .prettierrc   w korzeniu
docker-compose.yml        Postgres (bazy islanders_auth, islanders_world_1), Redis
docker/postgres-init.sql  tworzy obie bazy
apps/
  core/                   dotychczasowe src/, test/, drizzle/, nest-cli.json, vitest.config*
  auth/
packages/
  domain/                 @islanders/domain
  contracts/              @islanders/contracts
  platform/               @islanders/platform
```

Skrypty w korzeniu: `build` (najpierw `tsc -b packages/*`, potem aplikacje), `test`,
`test:e2e`, `lint`, `compose:up`, `compose:down` — delegowane przez `npm run --workspaces`.
Każda aplikacja ma własne `.env.example`, `db:generate`, `db:migrate` i skrypty CLI.

### 3.2 Kolejność przebudowy

Każdy krok kończy się zielonym `npm test` i `npm run test:e2e` całego repozytorium.

1. `git mv` dotychczasowego kodu do `apps/core` (zachowanie historii); root jako workspace.
2. `packages/domain` ← `src/domain` bez `geography` (ta zostaje w core do etapu 3).
   Core importuje `@islanders/domain`.
3. `packages/platform` ← `src/infra` (sekcja 3.3). Core importuje `@islanders/platform`.
4. `packages/contracts` (sekcja 3.4).
5. `apps/auth` (sekcja 4).
6. `docker-compose.yml`, `.env.example` obu aplikacji, README.

### 3.3 `packages/platform`

| Moduł | Pochodzenie | Zmiana |
|---|---|---|
| `config` | `infra/config` | `baseEnvSchema` (NODE_ENV, PORT, ADMIN_PORT, DATABASE_URL, REDIS_URL, TRUST_PROXY, SWAGGER_ENABLED, limity) rozszerzany przez aplikację; `parseEnv(schema, source)` |
| `db` | `infra/db` | `DbModule.forRoot({ schema })`, migrator z katalogiem migracji jako parametrem, `pg-errors` z wyeksportowanym `detailsFor` (spec A §15.1) |
| `http` | `infra/http` | `AllExceptionsFilter`, server-time, `configureApp`; limiter przepisany na Redis |
| `redis` | `infra/redis` | bez zmian |
| `swagger`, `time` | `infra/swagger`, `infra/time` | bez zmian |
| `health` | nowy | `/health/live` i `/health/ready` z rejestrowanymi sprawdzeniami (Postgres, Redis) |
| `internal-server` | nowy | uruchomienie drugiego serwera HTTP na `ADMIN_PORT` dla modułów oznaczonych jako wewnętrzne |

**Limiter na Redisie.** Okno stałe: klucz `rl:<bucket>:<key>:<window>`, `INCR` i przy wartości
1 `PEXPIRE` na długość okna, w jednym `MULTI`. Te same kubełki, zmienne i kody odpowiedzi co
dziś (`429`, nagłówek `Retry-After`). Przy niedostępnym Redisie limiter przepuszcza ruch
i loguje ostrzeżenie — utrata limitu jest mniejszym złem niż zatrzymanie logowania.

**Kolejność strażników** (spec A §15.1, pierwsza pozycja): limiter po adresie działa jako
middleware przed uwierzytelnieniem na wszystkich trasach, więc zalew złymi tokenami zużywa kubełek.
Limiter po koncie zostaje strażnikiem po uwierzytelnieniu.

`trust proxy` ustawiany z `TRUST_PROXY` (liczba przeskoków albo lista podsieci), domyślnie
wyłączony.

### 3.4 `packages/contracts`

Schematy zod z wyprowadzonymi typami, bez zależności poza `zod`:

- `claims`: `WorldsAccessClaims` (`iss`, `sub` uuid, `aud: islanders-worlds`, `roles`,
  `nickname`, `iat`, `exp`, `jti`), `ToolsClaims` (`aud: islanders-tools`), `ServiceClaims`
  (`aud: islanders-internal`, `sub: service:core:<slug>`); stałe `AUDIENCE`, `ROLES`.
- `worlds`: `WorldStatus` (`DRAFT`, `OPEN`, `CLOSED`, `ENDED`), `WorldRegistration`
  (`name`, `publicUrl`, `adminUrl`, `status`, `isTest`), `WorldListItem`.
- `events`: unia rozróżniana po `type` — `WorldStatusChanged` (`status`),
  `PlayerJoinedWorld` (`accountId`, `joinedAt`), `PlayerLeftWorld` (`accountId`, `leftAt`);
  każde z `eventId` uuid, `worldSlug`, `occurredAt`. `EventBatch` do 100 zdarzeń.
- `errors`: `ErrorBody` (`statusCode`, `error`, `message`, opcjonalne `field`).
- `slug`: `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–40 znaków.

## 4. `apps/auth`

### 4.1 Schemat

| Tabela | Klucz | Kolumny | Uwagi |
|---|---|---|---|
| `accounts` | `id uuid` | `email citext` unik., `nickname citext` unik., `password_hash`, `roles text[]` domyślnie `{player}`, `disabled_at`, `created_at` | CHECK: `roles <@ {player,tester,admin}` i `player = ANY(roles)` |
| `refresh_tokens` | `id uuid` | `account_id` → `accounts` cascade, `token_hash` unik., `expires_at`, `revoked_at`, `replaced_by_id`, `created_at` | semantyka jak w specu A |
| `worlds` | `slug` | `name`, `public_url`, `admin_url`, `status`, `is_test`, `reachable boolean` domyślnie `false`, `last_probe_at`, `created_at`, `updated_at` | |
| `world_memberships` | `(account_id, world_slug)` | `joined_at`, `left_at` | FK do `accounts` i `worlds` |
| `processed_events` | `event_id uuid` | `world_slug`, `type`, `received_at` | |

Walidacja pseudonimu, hasła i e-maila bez zmian wobec specu A §8.

### 4.2 Klucze i tokeny

- `JWT_SIGNING_KEYS`: JSON `[{ "kid": "...", "privateJwk": {...Ed25519...}, "status": "active" | "retiring" }]`.
  Dokładnie jeden `active`; walidacja przy starcie.
- Podpis: `jose` `SignJWT`, `alg: EdDSA`, `kid` klucza aktywnego, `iss = AUTH_ISSUER`.
- JWKS: klucze publiczne wszystkich wpisów, `Cache-Control: public, max-age=300`, na obu portach.
- Rotacja: dodaj nowy klucz jako `active`, stary oznacz `retiring`, usuń go najwcześniej po
  `JWT_ACCESS_TTL` + czas cache JWKS.
- Access token gracza: `JWT_ACCESS_TTL` (domyślnie 15 min), claimy `WorldsAccessClaims`.
- Token tools: 1 h, bez refresh tokenu.
- Token serwisowy: 5 min.

### 4.3 Trasy publiczne (`:3000`)

| Trasa | Ciało | Odpowiedź | Uwagi |
|---|---|---|---|
| `POST /v1/auth/register` | `{ email, nickname, password }` | `201 { accountId, nickname, roles, accessToken, refreshToken }` | 409 z `field` |
| `POST /v1/auth/login` | `{ email, password }` | `200` jak wyżej | atrapa argon2; konto zablokowane → 401 tą samą treścią |
| `POST /v1/auth/refresh` | `{ refreshToken }` | `200 { accessToken, refreshToken }` | okno łaski 60 s; rotacja w transakcji; zablokowane → 401; role i pseudonim czytane z bazy przy każdym odświeżeniu |
| `POST /v1/auth/logout` | `{ refreshToken }` | `204` | semantyka jak w specu A |
| `POST /v1/auth/tools/login` | `{ email, password }` | `200 { accessToken, expiresAt }` | 403, gdy konto bez roli `admin` |
| `GET /v1/worlds` | — | `200 [WorldListItem & { joined }]` | wymaga tokenu `islanders-worlds`; bez `DRAFT`; `isTest` tylko dla `tester`/`admin` |
| `GET /.well-known/jwks.json` | — | JWKS | publiczne |

Prefiks `/v1` bez `/api` — domena wskazuje usługę.

### 4.4 Trasy wewnętrzne (`:3001`)

| Trasa | Uwierzytelnienie | Zachowanie |
|---|---|---|
| `POST /internal/v1/token` | `{ clientId, clientSecret }` | porównanie skrótu w stałym czasie; token `ServiceClaims` |
| `PUT /internal/v1/worlds/:slug` | token serwisowy | tylko własny `worldSlug` (inaczej 403); upsert `WorldRegistration` |
| `POST /internal/v1/events` | token serwisowy | `EventBatch`; każde zdarzenie w transakcji: `INSERT processed_events … ON CONFLICT DO NOTHING`, gdy wstawiono — zastosuj (status świata, członkostwo); zdarzenie cudzego świata → 403 dla całej partii; zdarzenie o świecie spoza rejestru → 409 |
| `GET /.well-known/jwks.json` | — | jak publiczne |
| `GET /health/live`, `/health/ready` | — | Postgres i Redis auth |

`SERVICE_CLIENTS`: JSON `[{ "clientId": "...", "secretSha256": "...", "worldSlug": "world-1" }]`.
Sekret ma co najmniej 32 losowe bajty, więc SHA-256 wystarcza (bez argon2).

### 4.5 Sonda światów

Co 30 s pod blokadą doradczą Postgresa (`pg_try_advisory_lock`, pomijany cykl bez blokady):
dla każdego świata `GET <admin_url>/health/ready` z timeoutem 2 s, zapis `reachable`
i `last_probe_at`. Wynik sondy nie zmienia `status`.

### 4.6 CLI

| Komenda | Działanie |
|---|---|
| `account:roles --email <e> [--add r] [--remove r]` | zmiana ról; `player` nieusuwalny |
| `account:set-password --email <e>` | hasło z stdin, unieważnia refresh tokeny konta |
| `account:disable --email <e>` / `account:enable` | `disabled_at`; disable unieważnia refresh tokeny |
| `keys:generate` | wypisuje nowy wpis do `JWT_SIGNING_KEYS` |
| `client:create --world <slug>` | wypisuje `clientId`, sekret (jednorazowo) i wpis do `SERVICE_CLIENTS` |

### 4.7 Konfiguracja

`baseEnvSchema` plus: `AUTH_ISSUER` (URL), `JWT_SIGNING_KEYS`, `JWT_ACCESS_TTL`,
`JWT_REFRESH_TTL`, `SERVICE_CLIENTS`, `WORLD_PROBE_INTERVAL` (domyślnie `30s`).

## 5. Testy

**Jednostkowe:**
- parser `JWT_SIGNING_KEYS` (brak aktywnego, dwa aktywne, zły JWK);
- schematy `contracts` (odrzucenie złego sluga, nieznanego typu zdarzenia, partii > 100);
- limiter: wyliczanie klucza okna i `Retry-After`;
- przeniesione testy `domain` i `platform` przechodzą w nowych pakietach.

**E2E `apps/auth` (Testcontainers: Postgres, Redis):**
- przeniesione scenariusze z dzisiejszego `auth.e2e-spec.ts` (rejestracja, konflikty, atrapa,
  rotacja z oknem łaski, logout w oknie łaski) na nowych trasach;
- wydany access token weryfikuje się przez `jose` `createLocalJWKSet` z odpowiedzi
  `/.well-known/jwks.json` z `aud` i `iss` — dokładnie tak, jak zrobi to core;
- rotacja kluczy: token podpisany kluczem `retiring` przechodzi weryfikację po restarcie z nowym
  kluczem aktywnym, a po usunięciu starego klucza — nie;
- konto zablokowane: login i refresh 401, CLI enable przywraca;
- `tools/login`: 403 bez `admin`, token z `aud: islanders-tools` z nią;
- `GET /v1/worlds`: świat testowy niewidoczny dla `player`, widoczny dla `tester`; `DRAFT`
  niewidoczny; `joined` po zdarzeniu `PlayerJoinedWorld` i fałsz po `PlayerLeftWorld`;
- client credentials: zły sekret 401; `PUT` cudzego sluga 403;
- zdarzenia: ta sama partia wysłana dwukrotnie zmienia stan raz;
- trasy `/internal/*` nieosiągalne na porcie publicznym (404);
- limiter: dwie instancje aplikacji na tym samym Redisie dzielą jeden kubełek;
- sonda: świat z `admin_url` wskazującym na lokalny serwer testowy zwracający 200, potem 503.

**Core:** wszystkie dotychczasowe testy jednostkowe i e2e przechodzą bez zmian asercji po
przeniesieniu do `apps/core`; dochodzi test limitera po adresie przed uwierzytelnieniem.

## 6. Kolejność prac

1. Root workspace i `git mv` do `apps/core`; testy zielone.
2. `packages/domain`.
3. `packages/platform` bez zmian zachowania; potem limiter na Redisie i kolejność strażników.
4. `packages/contracts`.
5. `apps/auth`: szkielet z dwoma portami i health; schemat i migracje.
6. Konta i tokeny EdDSA, JWKS, rotacja kluczy.
7. Role, blokada, `tools/login`, CLI kont i kluczy.
8. Rejestr światów, client credentials, zdarzenia, sonda.
9. `docker-compose.yml`, `.env.example`, README pod monorepo.
