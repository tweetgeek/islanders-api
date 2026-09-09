# Islanders API

Backend gry Islanders (mobilne MMO RTS na archipelagu): NestJS 12, PostgreSQL (Drizzle),
Redis (zarezerwowany od specu C). Kontrakt HTTP i decyzje projektowe:
`docs/api-guidelines.md`, `docs/superpowers/specs/`, `docs/adr/`. Słownik domeny:
`../islanders/CONTEXT.md`.

## Start lokalny

```bash
npm install
cp .env.example .env            # uzupełnij JWT_SECRET (min. 32 znaki)
npm run compose:up              # Postgres 17 i Redis 7 w Dockerze
npm run db:migrate
npm run world:create -- --seed 1337 --width 200 --height 200 --wind 0.3,-0.1
npm run start:dev
```

Aplikacja słucha na `http://localhost:3000/api/v1`, dokumentacja Swagger (gdy
`SWAGGER_ENABLED=true`, domyślnie poza `NODE_ENV=production`) pod
`http://localhost:3000/api/docs`.

Porty publikowane przez `docker-compose.yml` (domyślnie `5432` i `6379`) można nadpisać
zmiennymi `POSTGRES_PORT` i `REDIS_PORT` w `.env`, gdy są lokalnie zajęte przez inny projekt.

## Testy

```bash
npm test                        # jednostkowe (vitest run), bez bazy
npm run test:e2e                # HTTP na Postgresie z Testcontainers — wymaga Dockera
npm run test:cov                # jednostkowe z pokryciem
```

Wśród testów jednostkowych jest test zgodności geografii
(`src/domain/geography/world-parity.spec.ts`): czyta plik
`${ISLANDERS_CLIENT_DIR}/contract/world-parity.json` z repozytorium klienta Godot
(`ISLANDERS_CLIENT_DIR`, domyślnie `../islanders` — patrz `.env.example`) i porównuje bit
po bicie generację terenu serwera z tym, co wygenerował klient dla tych samych światów.
Brak pliku jest błędem testu, nie pominięciem.

**Nie regeneruj tego pliku z serwera, żeby test przeszedł.** Plik jest zapisem tego, co
faktycznie liczy klient (Godot/GDScript); test istnieje po to, żeby wykryć rozjazd
implementacji, a nie żeby zawsze był zielony. Rozbieżność oznacza realny rozjazd kontraktu
klient–serwer i wymaga naprawy po stronie serwera (albo ustalenia z klientem, że kontrakt
się zmienia) — nigdy nadpisania pliku danymi z tego repozytorium.

## Migracje

Schemat bazy jest w `src/infra/db/schema/` (Drizzle, plik na tabelę). Migracje SQL
generowane z niego są commitowane w `drizzle/` i uruchamiane programowo, nie automatycznie
przy starcie aplikacji.

```bash
npm run db:generate             # po zmianie schematu w src/infra/db/schema/*
npm run db:migrate              # buduje projekt i uruchamia migrator na DATABASE_URL
```

## Inne komendy

```bash
npm run lint                    # oxlint src/ test/
npm run build                   # nest build
npm run world:create -- --seed <int> [--width <int>] [--height <int>] [--wind <x>,<y>]
npm run compose:down            # zatrzymuje kontenery Postgresa i Redisa
```

## Struktura

```
src/
  domain/       czysty rdzeń domenowy — geografia, reguły, balans, ekonomia, zegar;
                bez dekoratorów Nest, Drizzle ani Date.now(), testowany bez kontenera
  infra/        config (zod), połączenie z bazą, warstwa HTTP (prefiks /api/v1,
                walidacja, limiter zapytań, nagłówek czasu, filtr błędów), Swagger
  modules/      health, auth, players, worlds, settlements, fleets
  cli/          world:create
drizzle/        migracje SQL, commitowane
test/           testy e2e (Testcontainers + supertest)
docker-compose.yml   Postgres 17 i Redis 7 do pracy lokalnej
```

## Odstępstwa od specyfikacji

Implementacja w kilku miejscach świadomie odbiega od `docs/superpowers/specs/`. Pełna lista
z uzasadnieniami jest w sekcji 4.2 tego dokumentu
(`docs/superpowers/specs/2026-09-08-backend-foundation-geography-design.md`); w skrócie:
własny limiter zapytań zamiast `@nestjs/throttler` (konflikt wersji z Nest 12), własny
moduł konfiguracji zamiast `@nestjs/config`, health przez proste `SELECT 1` zamiast
`@nestjs/terminus`, nagłówek `X-Server-Time` z middleware zamiast interceptora, odczyt
kodu błędu Postgresa przez łańcuch `cause` (bo `drizzle-orm` opakowuje błąd sterownika),
oraz nadpisywalne porty w `docker-compose.yml`.

Znane pozycje przedprodukcyjne (niezrealizowane, patrz sekcja 15 tego samego dokumentu):
limiter zapytań nie chroni tras z nieprawidłowym tokenem (odrzuca je wcześniej strażnik
uwierzytelniania), limiter po adresie IP wymaga skonfigurowania zaufania do proxy przed
wdrożeniem za odwrotnym proxy, a rotacja tokenu odświeżającego nie jest objęta transakcją.
