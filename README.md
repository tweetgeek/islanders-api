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
npm run player:roles -w apps/auth -- --email <e> --add tester
echo 'nowe-haslo' | npm run player:set-password -w apps/auth -- --email <e>
npm run player:disable -w apps/auth -- --email <e>
npm run player:enable -w apps/auth -- --email <e>
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
