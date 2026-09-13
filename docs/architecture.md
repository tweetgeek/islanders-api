# Islanders — architektura backendu

Data: 2026-09-13
Status: docelowa architektura, zatwierdzona. Kod jeszcze jej nie odpowiada — przejście opisuje
roadmapa w `docs/superpowers/specs/2026-09-13-architecture-split-design.md`.
Decyzje z uzasadnieniami: ADR 0004–0007 w `docs/adr/`.
Terminologia: `../islanders/CONTEXT.md`.

Ten dokument opisuje, **jak system jest zbudowany**. Reguły gry, których serwer pilnuje,
opisuje `docs/api-guidelines.md`.

## 1. Zasada nadrzędna

**API jest jedynym źródłem prawdy dla klienta.** Klient niczego nie wylicza sam na potrzeby
stanu gry: geografię, biomy, znaleziska, pogodę, zasoby i terminy dostaje z serwera. Wszystko,
co tworzy świat, jest zapisane w bazie świata, więc świat da się odtworzyć 1:1 z jego bazy
(albo z eksportu) bez znajomości algorytmu, który go wygenerował.

## 2. Mapa systemu

```
                         internet (TLS, ingress)
  ┌──────────────────────┬─────────────────────────┬──────────────────────┬───────────────────────┐
  users.islanders.online   world-1.islanders.online  world-2-test.islanders tools.islanders.online
          │                        │                        │                  (tylko VPN)
     ┌────▼─────┐           ┌──────▼──────┐          ┌──────▼──────┐          ┌─────▼─────┐
     │  auth    │◄── JWKS ──│  core w-1   │          │  core w-2t  │          │  tools    │
     │ (NestJS) │◄─ outbox ─│ :3000 public│          │             │          │  (Nuxt)   │
     │          │           │ :3001 admin │◄─────────┼─────────────┼──────────│           │
     └────┬─────┘           └──┬───────┬──┘          └──┬───────┬──┘          └───────────┘
       PG auth             PG w-1   Redis w-1       PG w-2t  Redis w-2t
              ─── sieć wewnętrzna: auth:3001, core-world-1:3000/3001, … ───
```

| Usługa | Odpowiada za | Stan |
|---|---|---|
| **auth** | konta, hasła, sesje i refresh tokeny, role globalne, rejestr światów, klucze podpisu i JWKS, tokeny serwisowe; port publiczny `:3000`, wewnętrzny `:3001` | własny Postgres, Redis (limiter) |
| **core** | dokładnie jeden świat: ustawienia, mapa, pogoda, profile, osady, zlecenia, floty, API gry i API admina | własny Postgres, własny Redis (BullMQ, limiter) |
| **tools** | panel admina i narzędzia techniczne | bez własnej bazy; czyta z auth i z API admina core |

Świat testowy (`world-N-test`) to zwykły, osobny core z własną bazą, oznaczony w rejestrze
jako `isTest` i dostępny tylko dla ról `tester` i `admin`.

## 3. Repozytorium

Monorepo na npm workspaces. Klient Godot zostaje w osobnym repozytorium `../islanders`.

```
apps/
  auth/        NestJS — usługa kont
  core/        NestJS — jeden świat (obecny kod gry trafia tutaj)
  tools/       Nuxt — panel admina
packages/
  contracts/   schematy zod, DTO, typy claimów JWT i zdarzeń między usługami
  domain/      czysta domena gry: reguły, balans, ekonomia, zegar — bez Nest i bez bazy
  platform/    wspólna infrastruktura Nest: konfiguracja, Drizzle i migrator, filtr błędów,
               limiter na Redisie, server-time, health, drugi serwer HTTP na porcie wewnętrznym
```

Każda aplikacja buduje własny obraz. `domain` i `contracts` nie zależą od Nest ani od Drizzle;
`platform` zależy od nich świadomie. Pakiety są budowane `tsc -b` do `dist` i konsumowane
przez `exports`.

## 4. Tożsamość i uprawnienia

### 4.1 Przepływ klienta

1. Logowanie w auth: `POST https://users.islanders.online/v1/auth/login` → `accessToken`
   (15 min) i `refreshToken` (rotowany, okno łaski 60 s — logika ze specu A).
2. `GET /v1/worlds` w auth → rejestr: `slug`, `name`, `publicUrl`, `status`, `isTest`,
   `reachable`, `joined`. Świat testowy widzą tylko role `tester` i `admin`.
3. Klient łączy się bezpośrednio z `publicUrl` świata z `Authorization: Bearer <accessToken>`.
   Ruch gry nie przechodzi przez auth.

### 4.2 Tokeny

Podpis asymetryczny (EdDSA), `kid` w nagłówku, klucze publiczne pod
`/.well-known/jwks.json`.

| `aud` | Kto dostaje | Kto akceptuje | Claimy |
|---|---|---|---|
| `islanders-worlds` | gracz po zalogowaniu | publiczne API core | `sub` (accountId, uuid), `roles`, `nickname` |
| `islanders-tools` | konto z rolą `admin`, logowanie w tools | API admina core, API admina auth | `sub`, `roles` |
| `islanders-internal` | core (client credentials) | wewnętrzne API auth | `sub = service:core:<slug>` |

Wszystkie tokeny mają `iss = https://users.islanders.online`, `iat`, `exp`, `jti`.
**Token gracza nie zawiera listy światów** — dołączenie do świata nie wymaga nowego tokenu.

### 4.3 Decyzja o dostępie zapada w core, lokalnie

- Podpis, `iss`, `aud`, `exp` — kluczem z JWKS trzymanym w pamięci (odświeżanie co godzinę
  i przy nieznanym `kid`). Brak auth nie przerywa weryfikacji.
- Świat `isTest` wymaga roli `tester` lub `admin`.
- `POST /v1/join` tylko przy statusie `OPEN`; tworzy **profil** z kluczem `accountId`
  i kopią `nickname`.
- Każda inna trasa gry wymaga istniejącego profilu; zasób (osada, flota, zlecenie) musi
  należeć do profilu. Reguły informacyjne — `docs/api-guidelines.md`, sekcja 7.
- Ban na świecie to stan profilu w core. Ban globalny to odmowa wydania tokenu w auth —
  działa najpóźniej po czasie życia access tokenu.
- Core przechowuje o koncie wyłącznie `accountId` i `nickname`. E-mail nie opuszcza auth.

Natychmiastowe unieważnianie tokenów (kanał unieważnień z auth do core) jest świadomie
odłożone — ADR 0005.

## 5. Core — jeden świat

### 5.1 Dane

Jedna baza to jeden świat, więc żadna tabela nie ma `world_id`.

| Tabela | Klucz | Treść |
|---|---|---|
| `world_settings` | pojedynczy wiersz | `slug`, `name`, `status` (`DRAFT`, `OPEN`, `CLOSED`, `ENDED`), `width`, `height`, `is_test`, `generator_version`, `generator_params` jsonb (w tym seed), `weather_params` jsonb, `generated_at`, `opened_at` |
| `islands` | `(x, y)` | `biome`, `radius`, `shape_seed` (kosmetyka wybrzeża po stronie klienta), `is_start_candidate` |
| `deposits` | `(x, y)` → `islands` | bieżąca zawartość `wood … sulfur` |
| `weather` | `valid_from` | `kind`, `wind_x`, `wind_y`, `created_at` |
| `profiles` | `account_id` | `nickname`, `home_x`, `home_y`, `banned_at`, `joined_at` |
| `settlements` | `(x, y)` → `islands` | jak w specu A/B, bez `world_id` |
| `buildings`, `garrisons`, `settlement_orders`, `fleets` | jak w specach A/B, bez `world_id` | |
| `outbox` | `id` | zdarzenia do auth (sekcja 7) |

Klucz obcy `settlements(x, y) → islands(x, y)` egzekwuje w bazie „osada tylko na lądzie”.
Reguła „budynek zgodny z biomem” zostaje egzekwowana kluczami obcymi (ADR 0001 API), a biom
osady pochodzi z wiersza `islands`.

### 5.2 Cykl życia świata

```
world:init --config world.json   → migracje na pustej bazie, world_settings, status DRAFT
world:generate [--force]         → wyspy, znaleziska, pula startowa; powtarzalne tylko w DRAFT
world:open                       → status OPEN, zgłoszenie do rejestru auth (z ponawianiem)
world:export --out f [--with-players --anonymize]   → wersjonowany .json.gz
world:import --in f              → odtworzenie świata 1:1 na pustej bazie
```

Generator to czysta funkcja `generate(params) → WorldDraft` z numerem `generator_version`.
Te same parametry dają ten sam draft, ale to wygoda, nie kontrakt — autorytetem jest baza
(ADR 0004). Pula wysp startowych jest wyznaczana przy generacji tak, żeby każda wyspa startowa
miała w zasięgu wyspy innych biomów; dołączenie gracza wybiera z tej puli.

### 5.3 Pogoda

- Jedna pogoda dla całego świata, zmieniana co pełną godzinę UTC.
- Tabela `weather` trzyma pełną historię; zawsze istnieje wiersz bieżący i następny (prognoza).
- `nextWeather(prev, rng, params)` — czysta funkcja w `packages/domain`: płynny dryf wiatru,
  łańcuch Markowa dla `kind` (`CLEAR`, `CLOUDY`, `RAIN`, `STORM`).
- Tick: zadanie cykliczne BullMQ z `jobId` od godziny i sprawdzenie przy starcie; zapis
  `INSERT … ON CONFLICT (valid_from) DO NOTHING`; po przestoju uzupełniane są brakujące godziny.
- Wpływ na grę w MVP: wiatr z wiersza obowiązującego w chwili wypłynięcia floty zamraża jej
  czas podróży. Pozostałe efekty pogody wejdą osobnym specem.

### 5.4 Zadania w czasie

Zgodnie z ADR 0002 i 0003: baza jest źródłem prawdy, zadanie BullMQ niesie tylko identyfikator,
rozstrzygnięcie sprawdza `resolved_at` wewnątrz transakcji, zaległości przemiata start aplikacji
i cykl co minutę.

### 5.5 Powierzchnia HTTP

- Port publiczny (`:3000`, prefiks `/v1`): API gry — świat, mapa po prostokącie, osady,
  zlecenia, floty. Szczegóły w `docs/api-guidelines.md`, sekcja 8.
- Port wewnętrzny (`:3001`): `/admin/v1/*` (tylko token `islanders-tools`), `/health/live`,
  `/health/ready`, metryki. Ingress nigdy go nie wystawia.

## 6. Skalowanie

Auth i core są bezstanowe i uruchamiane w N replikach za rozdzielaczem obciążenia.

- Brak stanu w pamięci procesu: limiter zapytań na Redisie, klucze podpisu z sekretu,
  `trust proxy` z konfiguracji.
- Workery BullMQ działają w każdej replice core; współbieżność rozstrzyga baza
  (`SELECT … FOR UPDATE`, stała kolejność blokad).
- Prace „jedna na świat” (przemiatanie zaległości, wysyłka outboxa, tick pogody) biorą
  blokadę doradczą Postgresa bez czekania — wykonuje je jedna replika naraz.
- Migracje uruchamia osobny krok wdrożenia (Job lub initContainer), nigdy start aplikacji.
- `CORE_ROLE=all|api|worker` pozwala później rozdzielić API i workery bez zmian w kodzie;
  domyślnie `all`.
- Jeden świat na wielu serwerach (sharding mapy) nie jest celem MVP.

## 7. Komunikacja między usługami

Wyłącznie po sieci wewnętrznej, adresy z konfiguracji (`AUTH_INTERNAL_URL=http://auth:3001`),
nigdy przez publiczne domeny. Kontrakty w `packages/contracts`, ścieżki `/internal/v1`.

| Wywołanie | Kierunek | Cel |
|---|---|---|
| `GET /.well-known/jwks.json` | core → auth | klucze publiczne, cache |
| `POST /internal/v1/token` | core → auth | client credentials → token `islanders-internal` (5 min, cache) |
| `PUT /internal/v1/worlds/:slug` | core → auth | upsert rejestru: `publicUrl`, `adminUrl`, `status`, `isTest` |
| `POST /internal/v1/events` | core → auth | partia zdarzeń z outboxa, idempotentna po `eventId` |
| `GET <adminUrl>/health/ready` | auth → core | sonda dostępności świata dla pola `reachable` (co 30 s) |
| `/admin/v1/*` | tools → core | odczyty panelu |

**Outbox.** Zdarzenie (`WorldStatusChanged`, `PlayerJoinedWorld`, `PlayerLeftWorld`) zapisuje
się w tabeli `outbox` w tej samej transakcji co zmiana, która je wywołała. Wysyłacz pod blokadą
doradczą wysyła partie z backoffem i jitterem, oznacza wysłane, a auth przyjmuje je idempotentnie.
Gwarancja: co najmniej raz, w kolejności w obrębie świata.

**Wymagania na każdym kliencie HTTP:** timeout 2 s, ponawianie tylko operacji idempotentnych,
circuit breaker na kliencie auth.

## 8. Awarie

| Co jest niedostępne | Skutek | Zachowanie |
|---|---|---|
| auth | brak logowania, rejestracji i odświeżania tokenów | światy obsługują ruch z ważnymi tokenami; JWKS z pamięci; outbox czeka i ponawia; `ready` core pozostaje `true` |
| core świata N | tylko świat N | auth pokazuje świat jako `reachable: false`; tools pokazuje błąd tylko ekranów tego świata |
| Redis świata | nowe zadania nie są planowane | `ready = false`; po powrocie przemiatanie nadrabia zaległości z bazy |
| Postgres świata | świat stoi | `ready = false`, rozdzielacz zdejmuje ruch |
| Postgres auth | jak auth | jak auth |

`/health/live` sprawdza tylko proces. `/health/ready` sprawdza wyłącznie zależności, bez których
dana usługa nie może obsłużyć żadnego żądania — dla core to własny Postgres i Redis, nigdy auth.

## 9. Adresy i konfiguracja

| Adres publiczny | Usługa |
|---|---|
| `https://users.islanders.online` | auth |
| `https://world-<n>.islanders.online` | core świata `n` |
| `https://world-<n>-test.islanders.online` | core świata testowego |
| `https://tools.islanders.online` | tools, dostępne tylko przez VPN |

Konfiguracja walidowana zod przy starcie.

- **core:** `WORLD_SLUG`, `PUBLIC_URL`, `ADMIN_URL`, `PORT`, `ADMIN_PORT`, `DATABASE_URL`,
  `REDIS_URL`, `AUTH_INTERNAL_URL`, `AUTH_ISSUER`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`,
  `CORE_ROLE`, `TRUST_PROXY`.
- **auth:** `PORT`, `ADMIN_PORT`, `AUTH_ISSUER`, `DATABASE_URL`, `REDIS_URL`, `JWT_SIGNING_KEYS`
  (JSON z `kid`, aktywny klucz i klucze wycofywane), `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`,
  `SERVICE_CLIENTS` (identyfikatory, skróty sekretów, slug świata), `TRUST_PROXY`.
- **tools:** `AUTH_INTERNAL_URL`, `AUTH_PUBLIC_URL`.

Lokalnie `docker-compose.yml` stawia jeden Postgres z osobnymi bazami dla auth i każdego
świata, jeden Redis z osobnymi numerami baz, oraz auth i `core-world-1` na portach hosta
(auth `3000` publiczny i `3001` wewnętrzny, core `3100` publiczny i `3101` wewnętrzny).

## 10. Testy

- Jednostkowe per pakiet i aplikacja, bez sieci i bazy.
- E2E per aplikacja na Testcontainers. Core w testach dostaje własną parę kluczy i lokalny JWKS
  zamiast prawdziwego auth.
- Test kontraktowy auth ↔ core na schematach z `packages/contracts`.
- Test awarii: core przy niedostępnym auth obsługuje żądanie z ważnym tokenem, a outbox
  dostarcza zdarzenia po powrocie auth.
