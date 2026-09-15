# Islanders — spec 0: podział backendu na auth, core świata i tools

Data: 2026-09-13
Status: zatwierdzony w brainstormingu
Docelowa architektura: `docs/architecture.md`. Decyzje: ADR 0004–0007.
Zastępuje: kierunek architektoniczny specu A (`2026-09-08-backend-foundation-geography-design.md`),
specu B (`2026-09-11-settlement-economy-design.md`) i specu panelu admina
(`2026-09-11-admin-panel-design.md`). Treść domenowa tych dokumentów obowiązuje dalej tam,
gdzie ten spec nie mówi inaczej.

## 1. Cel

Dotychczasowy backend był jednym procesem obsługującym wszystkie światy w jednej bazie,
z geografią liczoną z seeda wspólnie z klientem. Nowe założenia:

- API jest jedynym źródłem prawdy dla klienta;
- jedno konto na wiele światów, konta w osobnej usłudze;
- każdy świat to osobna aplikacja z własną bazą i kolejkami, pod własną subdomeną;
- świat generowany i zapisywany w bazie, odtwarzalny lokalnie 1:1;
- pogoda ustalana co godzinę dla całego świata;
- panel admina jako osobna, niepubliczna aplikacja;
- auth i core gotowe do pracy w wielu replikach;
- komunikacja między usługami po sieci wewnętrznej, odporna na niedostępność.

Żaden gracz nie jest podłączony do API, więc zmiany są destrukcyjne: bez migracji danych,
bez okresu zgodności wstecznej, migracje Drizzle w każdej aplikacji zaczynają się od zera.

Ten spec jest mapą przejścia. Nie zawiera planu implementacji; każdy etap z sekcji 4 dostaje
własny spec, plan i implementację.

## 2. Rozstrzygnięcia

| # | Pytanie | Decyzja | Gdzie |
|---|---|---|---|
| 1 | Źródło geografii | Baza świata; klient pobiera mapę z API, nie liczy jej z seeda | ADR 0004 |
| 2 | Weryfikacja tożsamości w świecie | JWT EdDSA z auth, weryfikowany lokalnie przez JWKS; decyzja o dostępie w core; kanał unieważnień odłożony | ADR 0005 |
| 3 | Organizacja kodu | Monorepo npm workspaces: `apps/auth`, `apps/core`, `apps/tools`, `packages/contracts`, `packages/domain` | architektura §3 |
| 4 | Świat testowy | Osobny core z własną bazą, w rejestrze jako `isTest`, dostęp dla ról `tester` i `admin`; bazę można zasilić kopią świata produkcyjnego z profilami graczy (anonimizacja opcjonalna) | architektura §2, §4.3 |
| 5 | Tworzenie świata | CLI w core: `init` → `generate` (powtarzalne w `DRAFT`) → `open` z samozgłoszeniem do auth; `export`/`import` | architektura §5.2 |
| 6 | Pogoda | Jedna na świat, co godzinę, z historią i prognozą na następną godzinę; w MVP wpływa tylko wiatrem na czas podróży | architektura §5.3 |
| 7 | Dane dla tools | Logowanie przez auth (`aud: islanders-tools`), odczyty z API admina core na porcie wewnętrznym | architektura §5.5 |
| 8 | Komunikacja między usługami | HTTP po sieci wewnętrznej, outbox w core, tokeny serwisowe, timeouty i circuit breaker | ADR 0007 |
| 9 | Trwająca praca nad specem B | Wstrzymana; WIP zacommitowany na `feat/spec-b-economy`; spec B wraca jako etap 5 | §4 |
| 10 | Liczba procesów na świat | Jeden świat w N replikach bezstanowych; podział mapy na wiele baz poza celem | ADR 0006 |

## 3. Co zostaje z obecnego kodu

| Obecnie | Trafia do | Zmiana |
|---|---|---|
| `src/domain/rules`, `balance`, `economy`, `time` | `packages/domain` | bez zmian merytorycznych |
| `src/domain/geography` (hasz, szum, wyspa) | `apps/core/src/worldgen` | przestaje być kontraktem z klientem; staje się pierwszą wersją generatora |
| `world-parity.spec.ts`, `ISLANDERS_CLIENT_DIR` | — | usunięte |
| `src/modules/auth`, `players`, `refresh_tokens` | `apps/auth` | HS256 → EdDSA z JWKS; `players.id serial` → `players.id uuid`; rotacja z oknem łaski bez zmian |
| `src/modules/worlds` | `apps/auth` (rejestr) i `apps/core` (ustawienia, dołączanie, profile) | `worlds` → `world_settings` w core i `worlds` rejestr w auth |
| `src/modules/settlements`, `fleets` | `apps/core` | bez `world_id`; widoki i reguły informacyjne bez zmian |
| `src/infra/*` (config, db, http, swagger, redis, time) | `packages/platform` | limiter na Redisie, `trust proxy`, dwa porty w core |
| `src/cli/create-world.ts` | `apps/core/src/cli` | zastąpiony przez `world:init/generate/open/export/import` |
| `drizzle/` | `apps/auth/drizzle`, `apps/core/drizzle` | migracje od zera |
| ADR 0001–0003 API | bez zmian | ADR 0001 z adnotacją o źródle biomu (ADR 0004) |

Pozycje przedprodukcyjne z sekcji 15 specu A pozostają aktualne i przechodzą do etapów,
w których dotykany jest ich kod: limiter i `trust proxy` (etapy 1–2), cykl modułów
`WorldsModule` ⇄ `SettlementsModule` (znika przy etapie 2, bo moduł światów się rozpada),
wydajność odczytów po `bbox` i wyboru wyspy domowej (etap 3, wyspy startowe w bazie),
wycofywanie migracji (etap 1).

## 4. Roadmapa

Każdy etap ma własny cykl: spec → plan → implementacja → przegląd. Etap zaczyna się
dopiero, gdy poprzedni jest wdrożony na gałęzi głównej.

### Etap 1 — monorepo i auth

- Przeniesienie repozytorium na npm workspaces; dotychczasowy kod jako `apps/core` bez zmian
  zachowania; `packages/domain`, `packages/contracts` i `packages/platform`.
- Spec: `docs/superpowers/specs/2026-09-13-stage-1-monorepo-and-auth-design.md`.
- `apps/auth`: rejestracja, logowanie, odświeżanie, wylogowanie (logika ze specu A §8),
  konta uuid, role `player`/`tester`/`admin`, EdDSA z rotacją kluczy, JWKS, client credentials
  dla usług, rejestr światów (`PUT /internal/v1/worlds/:slug`, `GET /v1/worlds`),
  przyjmowanie zdarzeń (`POST /internal/v1/events`), limiter na Redisie, `trust proxy`.
- `docker-compose` z auth i core.
- Kryterium ukończenia: auth działa samodzielnie z testami e2e; core nadal ma stare trasy
  auth (usuwane w etapie 2).

### Etap 2 — core jednego świata

- Spec: `docs/superpowers/specs/2026-09-14-stage-2-single-world-core-design.md`.

- Usunięcie `world_id` ze wszystkich tabel i tras (`/v1/world`, `/v1/settlements…`,
  `/v1/fleets…`); usunięcie modułów kont z core.
- Weryfikacja tokenów przez JWKS z cache, strażnicy ról i profilu, profil kluczowany `playerId`.
- Port wewnętrzny z `/health/live`, `/health/ready` i szkieletem `/admin/v1`.
- Outbox i wysyłacz; samozgłoszenie świata do auth; klient auth z timeoutem i circuit breakerem.
- Limiter na Redisie, `trust proxy`, `CORE_ROLE`.
- Test awarii: niedostępny auth nie zatrzymuje ruchu z ważnym tokenem.

### Etap 3 — generacja świata i mapa z API

- Tabele `world_settings`, `islands`, `deposits`; klucz obcy osady do wyspy.
- Generator `generate(params)` na bazie obecnego szumu; położenie wyspy w komórce zapisane w bazie;
  wyspy startowe bez rezerwacji; `HomeIslandPicker` wybiera wolną wyspę startową, a po ich
  wyczerpaniu dowolną wolną wyspę o dozwolonym biomie.
- CLI `world:init`, `world:generate`, `world:open`, `world:export`, `world:import`
  z wersjonowanym formatem; profile domyślnie zachowane, anonimizacja opcjonalna.
- `GET /v1/map/islands?bbox=` z limitem pola i `ETag`.
- Usunięcie testu zgodności z klientem.

### Etap 4 — pogoda

- Tabela `weather` (wiatr i warunki), `nextWeather` w `packages/domain`, tick godzinowy z uzupełnianiem luk,
  prognoza w `GET /v1/world`.
- Wiatr z tabeli pogody w miejsce `worlds.wind_*`.

### Etap 5 — ekonomia osady (spec B przepisany)

- Treść specu B (formuły, kolejki zleceń, garnizon, anulowanie, rozstrzyganie, testy) bez zmian
  merytorycznych; schemat bez `world_id`; sekcja 10 specu B (praca wielo-instancyjna)
  jest już zrealizowana przez etapy 1–2.
- Punkt wyjścia: WIP na gałęzi `feat/spec-b-economy` jako materiał, nie baza gałęzi.

### Etap 6 — tools

- Spec panelu admina przepisany: Nuxt w `apps/tools`, logowanie przez auth, odczyty z
  `/admin/v1` każdego świata, lista światów z rejestru, ekran mapy z danych `islands`.
- Wdrożenie tylko w sieci wewnętrznej / VPN.

### Etap 7 — floty (dawny spec C)

- Wysyłka, rozstrzyganie, powrót, kolonizacja, wyprawy na `deposits`, atak binarny;
  czas podróży z wiatru obowiązującego w chwili wypłynięcia.

## 5. Praca po stronie klienta (`../islanders`)

Nie jest częścią tego repozytorium; wymieniona, żeby etapy backendu nie wyprzedziły klienta
bez świadomości kosztu.

1. Logowanie przez `users.islanders.online`, lista światów z auth, połączenie z `publicUrl`
   wybranego świata; dwa bazowe adresy w `HttpProvider` (etap 1–2).
2. `ownerId` i `playerId` jako uuid zamiast `int` (etap 1–2).
3. Trasy świata bez `/worlds/:id` w ścieżce (etap 2).
4. `WorldGrid.gd` pobiera wyspy z `GET /v1/map/islands?bbox=` zamiast liczyć z seeda; cache
   fragmentów; wybrzeże z `shapeSeed` (etap 3).
5. Wycofanie `contract/world-parity.json` i `run_parity.sh`; ADR 0001 klienta z adnotacją
   „zastąpiony przez ADR 0004 API” (etap 3).
6. Pogoda i prognoza w HUD (etap 4).
7. `CONTEXT.md` zaktualizowany w sesji przesłuchania 2026-09-13: **World**, **Round**, **Island**,
   **Deposit**, **Wind** i **Travel Time** zmienione; nowe **Weather**, **Condition**, **Forecast**,
   **Test World**, **Start Island**, **Blocked Player**. Tożsamość ponad światami to nadal **Player**
   (bez pojęcia „Account”).

## 6. Poza zakresem całej przebudowy

- Zamrożenie profilu na jednym świecie (ban na świecie) — wymaga reguł dla flot i zleceń;
  osobny spec po etapie 7. Do tego czasu istnieje tylko gracz zablokowany w auth.
- Rezygnacja z profilu i ponowny start na tym samym świecie — profil nie kończy się w MVP.
- Efekty warunków pogodowych na rozgrywkę.

## 7. Zmiany w dokumentacji wykonane w tym specu

- `docs/architecture.md` — nowy, docelowa architektura.
- `docs/adr/0004`–`0007` — nowe.
- `docs/adr/0001` — adnotacja o źródle biomu.
- `docs/api-guidelines.md` — przepisany pod nową architekturę; treść domenowa zachowana.
- Spec A, spec B, spec panelu admina i plany A i B — nagłówek statusu wskazujący ten spec.
- `README.md` — sekcja o przejściu na nową architekturę; pełne przepisanie w etapie 1,
  razem ze zmianą struktury repozytorium.
