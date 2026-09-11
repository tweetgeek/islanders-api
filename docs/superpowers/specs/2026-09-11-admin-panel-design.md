# Islanders API — panel administracyjny (podgląd)

Data: 2026-09-11
Status: zatwierdzony w brainstormingu, czeka na plan implementacji
Zależności: spec A (`2026-09-08-backend-foundation-geography-design.md`, wdrożony).
Niezależny od specu B (`2026-09-11-settlement-economy-design.md`); sekcja 4.3 wskazuje,
co dojdzie do panelu po jego wdrożeniu.

## 1. Cel i zakres

Prosty, deweloperski interfejs WWW do podglądu stanu gry: światów, graczy, osad i flot.
Wyłącznie odczyt. Renderowany po stronie serwera jako HTML, bez JavaScriptu w przeglądarce,
bez silnika szablonów i bez narzędzi do budowania frontendu.

Panel istnieje tylko wtedy, gdy w `.env` jest ustawiony sekret `ADMIN_TOKEN`, i tylko poza
`NODE_ENV=production`. Wejście wymaga podania tego sekretu w formularzu logowania.

Poza zakresem tej wersji (zapisane, żeby nie wracać do dyskusji):

- jakiekolwiek akcje zmieniające stan (status świata, tworzenie świata, edycja zasobów,
  unieważnianie sesji graczy);
- paginacja i filtrowanie list;
- praca na produkcji za HTTPS (ciasteczko `Secure`, wygasanie sesji, limiter na panelu poza
  formularzem logowania);
- rola administratora przypięta do konta gracza w bazie;
- garnizon i kolejka zleceń osady, które powstają dopiero w specu B (sekcja 4.3).

## 2. Rozstrzygnięcia, z których wynika reszta

| Pytanie | Decyzja | Konsekwencja |
|---|---|---|
| Kto ma dostęp | Flaga plus sekret w `.env`, sesja w ciasteczku | Brak ról w bazie, brak migracji, jeden „admin" |
| Jak powstaje UI | HTML składany po stronie serwera funkcjami TypeScript | Zero JS w przeglądarce, testy przez supertest jak reszta API |
| Co widać | Wyłącznie podgląd | Wszystkie trasy to `GET` poza logowaniem i wylogowaniem |
| Gdzie działa | Tylko lokalnie / dev | `ADMIN_TOKEN` w `production` to błąd startu; ciasteczko bez `Secure` |
| Skąd dane | Własne repozytorium odczytów w module admina | Repozytoria graczy nie dostają metod „dla admina" |

Odrzucone alternatywy: statyczna mini‑aplikacja JS z osobnym JSON‑owym API (dwie warstwy do
utrzymania), osobny projekt frontendowy z bundlerem (nowy toolchain w repozytorium backendu),
osobny proces `admin.ts` ze wspólną bazą (drugi bootstrap i drugi port), rozszerzanie
istniejących repozytoriów o metody admina (miesza reguły widoczności gracza z panelem).

## 3. Konfiguracja i włączanie

### 3.1 Zmienna środowiskowa

Jedna nowa zmienna w `env.ts`:

| Zmienna | Typ | Reguła |
|---|---|---|
| `ADMIN_TOKEN` | string, opcjonalna | Gdy ustawiona: minimum 16 znaków. Gdy ustawiona przy `NODE_ENV=production`: błąd walidacji `EnvValidationError` z komunikatem, że panel jest narzędziem deweloperskim |

Transformacja schematu dodaje pole wyliczone `ADMIN_ENABLED: boolean`, prawdziwe wtedy i tylko
wtedy, gdy `ADMIN_TOKEN` jest ustawiony. Sekret jest jednocześnie flagą: nie da się włączyć
panelu bez sekretu ani zostawić sekretu „na zapas" bez włączenia panelu.

`.env.example` dostaje wpis z komentarzem (domyślnie zakomentowany, żeby świeża kopia nie
włączała panelu) i podpowiedzią generowania: `openssl rand -base64 24`.

### 3.2 Rejestracja modułu

`AppModule.forRoot(env)` importuje `AdminModule` wyłącznie gdy `env.ADMIN_ENABLED`. Przy
wyłączonym panelu trasy `/admin/*` nie są w ogóle zarejestrowane, więc odpowiadają 404 tak jak
każda nieistniejąca ścieżka, a nie „istnieją i odmawiają".

`configureApp` wyklucza panel z globalnego prefiksu:

```ts
app.setGlobalPrefix('api/v1', { exclude: ['admin', 'admin/{*path}'] });
```

Wykluczenie jest bezwarunkowe (nie zależy od `ADMIN_ENABLED`), bo dotyczy tylko dopasowania
prefiksu, a przy wyłączonym module nie ma czego dopasować. Test e2e sprawdza, że `/api/v1/health`
działa w obu konfiguracjach.

## 4. Powierzchnia HTTP

### 4.1 Uwierzytelnienie

| Metoda i trasa | Zachowanie |
|---|---|
| `GET /admin/login` | Formularz z jednym polem `token` typu `password` i przyciskiem. Gdy sesja już jest ważna: 303 na `/admin` |
| `POST /admin/login` | Ciało `application/x-www-form-urlencoded` z polem `token`. Porównanie z `ADMIN_TOKEN` przez `timingSafeEqual` na buforach równej długości (różna długość = odrzucenie bez porównania). Sukces: ciasteczko sesji i 303 na `/admin`. Porażka: ten sam formularz z komunikatem „Nieprawidłowy token", status 401 |
| `POST /admin/logout` | Czyści ciasteczko (`Max-Age=0`) i 303 na `/admin/login` |

Ciasteczko `admin_session`: wartość `HMAC-SHA256(klucz = ADMIN_TOKEN, wiadomość = "admin-session")`
w zapisie hex; atrybuty `HttpOnly`, `SameSite=Lax`, `Path=/admin`, bez `Max-Age` (sesyjne,
znika z zamknięciem przeglądarki). Bez stanu w bazie: zmiana `ADMIN_TOKEN` w `.env` unieważnia
wszystkie sesje. Guard porównuje wartość z nagłówka `Cookie` z oczekiwaną przez `timingSafeEqual`.

Nagłówek `Cookie` parsujemy własną funkcją `parseCookies(header)` (podział po `;` i pierwszym
`=`, `decodeURIComponent` wartości, błędy dekodowania traktowane jak brak ciasteczka). Nie
dodajemy `cookie-parser`; ustawianie ciasteczka robi wbudowane `res.cookie` Expressa 5.

`POST /admin/login` dostaje `@RateLimit('ip')` z istniejącego `RateLimitGuard` (limit
`RATE_LIMIT_AUTH_PER_MINUTE`, ten sam co `/auth/*`). Pozostałe trasy panelu nie ustawiają
`req.playerId` i nie mają jawnego klucza, więc limiter przepuszcza je bez zmian w jego kodzie.

Kontroler jest oznaczony `@Public()` (wyłącza globalny `JwtAuthGuard`) i `@UseGuards(AdminSessionGuard)`.
Logowanie i wylogowanie są wyłączone spod guarda własną metadaną `@AdminAnonymous()`.
Brak lub zła sesja na chronionej trasie: guard rzuca `UnauthorizedException`, a filtr z sekcji 6
zamienia to na 303 do `/admin/login`.

### 4.2 Widoki

Wszystkie `GET`, każdy zwraca pełny dokument HTML ze wspólnym układem: nagłówek z nawigacją
(Światy, Gracze, Wyloguj), arkusz stylów inline (kilkadziesiąt linii, tabele z obramowaniem,
czytelna czcionka systemowa), bez zewnętrznych zasobów i bez JS. Czasy w ISO 8601 UTC, jak w API.
Listy bez paginacji, posortowane rosnąco po identyfikatorze.

| Trasa | Zawartość |
|---|---|
| `GET /admin` | 303 na `/admin/worlds` |
| `GET /admin/worlds` | Tabela światów: id (link), seed, szerokość × wysokość, wiatr `(x, y)`, status, liczba profili, liczba osad, `created_at` |
| `GET /admin/worlds/:id` | Nagłówek z polami świata. Tabela profili: gracz (nick, link do gracza), osada domowa (`x, y`, link do osady; „brak" gdy `NULL`), `joined_at`. Tabela osad: pozycja (link), nazwa, właściciel (nick, link), biom, populacja, pięć zasobów przechowywanych, `last_sync_at`, `founded_at`. Tabela flot: id, misja, właściciel (nick, link), `from → to`, `depart_at`, `arrive_at`, `resolved_at` („w drodze" gdy `NULL`) |
| `GET /admin/worlds/:id/settlements/:x/:y` | Nagłówek: nazwa, świat (link), pozycja, właściciel (link), biom, `founded_at`, `last_sync_at`. Sekcja zasobów: tabela z wierszem na zasób i kolumnami „w bazie" (surowa wartość) i „teraz" (wyliczona), plus pojemność, produkcja na godzinę i populacja. Tabela budynków: typ, poziom |
| `GET /admin/players` | Tabela graczy: id (link), nick, e‑mail, `created_at`, liczba profili, liczba aktywnych tokenów odświeżających (nieunieważnione i niewygasłe na moment żądania) |
| `GET /admin/players/:id` | Nagłówek konta (id, nick, e‑mail, `created_at`). Tabela profili: świat (link), osada domowa (link lub „brak"), `joined_at`. Tabela osad gracza na wszystkich światach (jak w widoku świata, plus kolumna świata). Tabela flot gracza. Tabela tokenów odświeżających: id, `created_at`, `expires_at`, `revoked_at`, `replaced_by_id`; skrótu tokenu nie pokazujemy |

Wartości wyliczone w szczegółach osady liczy `ownView` z `src/modules/settlements/settlement-views.ts`
(czysta funkcja: zasoby „teraz", pojemność, produkcja na godzinę) z `now` pobranym z `Clock`
wstrzykiwanego przez `CLOCK`. Panel nie liczy niczego sam; jeśli klient i API widzą inne liczby
niż panel, błąd jest w danych, nie w panelu.

### 4.3 Miejsce na spec B

Po wdrożeniu specu B widok osady dostanie dwie tabele: garnizon (`military_type`, liczba) i
kolejka zleceń (rodzaj, pozycja, ładunek, koszt, `started_at`, `finish_at`, `resolved_at`).
Wymaga to jedynie dwóch dodatkowych zapytań w repozytorium i dwóch sekcji w widoku; nic w tym
specu nie musi się zmienić. Do tego czasu sekcje po prostu nie istnieją.

## 5. Struktura modułu

```
src/modules/admin/
  admin.module.ts            rejestruje kontroler, guard, filtr, repozytorium
  admin.controller.ts        trasy z sekcji 4; metody zwracają string albo przekierowują
  admin-session.guard.ts     czyta Cookie, porównuje z oczekiwaną wartością, rzuca 401
  admin-session.ts           czyste funkcje: sessionValue(token), parseCookies(header),
                             tokenMatches(given, expected); bez Nest i bez Express
  admin-anonymous.decorator.ts  metadana wyłączająca guard dla login/logout
  admin.repository.ts        odczyty Drizzle, wyłącznie SELECT
  admin-html.filter.ts       filtr wyjątków kontrolera (sekcja 6)
  views/
    html.ts                  tag `html` z escapowaniem, `raw()`, formatowanie dat i liczb
    layout.ts                dokument, nawigacja, style
    login.ts, worlds.ts, world.ts, settlement.ts, players.ts, player.ts, error.ts
```

Zasady:

- **Repozytorium** ma jedną metodę na widok: `listWorlds()`, `worldDetail(id)`,
  `settlementDetail(worldId, x, y)`, `listPlayers(now)`, `playerDetail(id)`. Zliczenia
  (profile, osady, aktywne tokeny) robi SQL przez `count()` z `GROUP BY` albo podzapytania;
  nicki właścicieli przy osadach i flotach pochodzą z JOIN‑ów. Żadnych zapytań w pętli po
  wierszach. Zwraca zwykłe obiekty z nazwanymi polami; widoki nie importują Drizzle.
  Metody szczegółów zwracają `undefined`, gdy encja nie istnieje; kontroler zamienia to na
  `NotFoundException`.
- **Widoki** to funkcje `(dane) => string`. Tag `html` escapuje każdą interpolację
  (`& < > " '`); surowy HTML wchodzi wyłącznie przez jawne `raw(...)`, używane tylko do
  składania fragmentów już zbudowanych tym samym tagiem. To jedyna ochrona przed wstrzyknięciem
  i musi być kompletna, bo nicki i nazwy osad pochodzą od graczy.
- **Kontroler** ma `@Header('Content-Type', 'text/html; charset=utf-8')` na klasie.
  `ServerTimeInterceptor` dopisuje `serverTime` tylko do odpowiedzi‑obiektów, więc stringi
  przechodzą bez zmian. Przekierowania robi `@Redirect` albo `res.redirect(303, ...)`
  z `@Res({ passthrough: true })` tam, gdzie trzeba jednocześnie ustawić ciasteczko.
- **Parametry ścieżki** przechodzą przez `ParseIntPipe({ errorHttpStatusCode: 404 })`, jak
  w kontrolerze światów. Ciało logowania to DTO z `class-validator` (`token: string`), żeby
  globalny `ValidationPipe` z `forbidNonWhitelisted` nie odrzucał formularza z powodu
  nieznanych pól, a zarazem nie przepuszczał czegokolwiek innego.
- Formularze wymagają `express.urlencoded`; Nest rejestruje ten parser domyślnie
  (`bodyParser: true`), więc nic nie dochodzi.

## 6. Obsługa błędów

Globalny `AllExceptionsFilter` odpowiada JSON‑em, nieczytelnym w przeglądarce. Kontroler admina
dostaje własny filtr przez `@UseFilters(AdminHtmlExceptionFilter)`, z `@Catch(HttpException)`:

| Wyjątek | Odpowiedź |
|---|---|
| 401 (`UnauthorizedException` z guarda) | 303 na `/admin/login` |
| 404 (`NotFoundException`, zły format id z `ParseIntPipe`) | Strona HTML „Nie znaleziono" z układem panelu, status 404 |
| pozostałe `HttpException` (400 z walidacji, 429 z limitera) | Strona HTML z kodem i komunikatem wyjątku, status wyjątku |

Wszystko, co nie jest `HttpException`, filtr kontrolera przepuszcza do globalnego: log
z `errorId` i JSON 500. Logika logowania awarii zostaje w jednym miejscu; dla narzędzia
deweloperskiego JSON przy awarii wystarcza.

Filtr sprawdza `res.headersSent` tak samo jak globalny, żeby nie rzucić wewnątrz filtra.

## 7. Testy

### 7.1 Jednostkowe (`vitest run`, bez bazy)

- `env.spec.ts`: brak `ADMIN_TOKEN` → `ADMIN_ENABLED === false`; token krótszy niż 16 znaków →
  `EnvValidationError`; token przy `NODE_ENV=production` → `EnvValidationError`; poprawny
  token → `ADMIN_ENABLED === true`.
- `admin-session.spec.ts`: `parseCookies` na pustym nagłówku, na jednym i kilku ciasteczkach,
  na wartości zakodowanej procentowo i na wartości z nieprawidłowym kodowaniem; `sessionValue`
  daje różne wyniki dla różnych tokenów i ten sam dla tego samego; `tokenMatches` odrzuca
  wartość innej długości bez rzucania.
- `views/html.spec.ts`: interpolacja `<script>alert(1)</script>` wychodzi jako encje; `raw`
  nie escapuje; liczby i daty formatowane deterministycznie.
- `views/*.spec.ts` dla widoków list i szczegółów: HTML zawiera nick, nazwę osady, linki
  do szczegółów; wartości `NULL` dają etykiety „brak" / „w drodze".

### 7.2 E2E (`test/admin.e2e-spec.ts`, Postgres z Testcontainers)

Aplikacja z `createTestApp({ env: { ADMIN_TOKEN: '...' }, clock })` i fixtures z `test/support`:

- `GET /admin/worlds` bez ciasteczka → 303 na `/admin/login`.
- `POST /admin/login` ze złym tokenem → 401 z formularzem; z dobrym → 303 na `/admin`
  i nagłówek `Set-Cookie` z `admin_session`, `HttpOnly`, `Path=/admin`.
- Z ciasteczkiem: `/admin/worlds`, `/admin/worlds/:id`, `/admin/worlds/:id/settlements/:x/:y`,
  `/admin/players`, `/admin/players/:id` → 200, `Content-Type: text/html`, treść zawiera nick
  gracza z fixtures, nazwę osady i liczbę profili; widok osady pokazuje zasoby „teraz" zgodne
  z `ownView` dla `FixedClock`.
- Nick z `<` w nazwie osady wychodzi w HTML‑u jako encja (test wstrzyknięcia od końca do końca).
- `/admin/worlds/999999` i `/admin/worlds/abc` → 404 z `text/html`.
- `POST /admin/logout` → 303 i `Set-Cookie` z `Max-Age=0`; kolejne `GET /admin/worlds` → 303.
- `/api/v1/health` działa z włączonym panelem (prefiks nienaruszony).
- Druga aplikacja bez `ADMIN_TOKEN`: `/admin/worlds` i `/admin/login` → 404, a `/api/v1/health`
  → 200.

`http.e2e-spec.ts` już testuje limit `RATE_LIMIT_AUTH_PER_MINUTE`; dla `POST /admin/login`
wystarczy jeden przypadek z limitem `1`, że drugie logowanie daje 429 (HTML).

## 8. Dokumentacja

- `README.md`: akapit o panelu w sekcji „Start lokalny" (`ADMIN_TOKEN`, adres `/admin`,
  „tylko dev").
- `.env.example`: zakomentowany wpis `ADMIN_TOKEN` z opisem.
- `docs/api-guidelines.md` sekcja 1 wymienia panel administracyjny jako poza zakresem pierwszej
  wersji; przy wdrożeniu dopisać tam odnośnik do tego specu zamiast usuwać zdanie.

## 9. Kolejność prac

1. `ADMIN_TOKEN` w `env.ts` z testami, `.env.example`, wykluczenie prefiksu w `configureApp`.
2. `admin-session.ts` z testami, guard, dekorator anonimowy, filtr HTML.
3. `views/html.ts` i `layout.ts` z testami escapowania; widok logowania i błędu.
4. Kontroler z logowaniem i wylogowaniem, rejestracja warunkowa w `AppModule`, pierwsze
   testy e2e (sesja, 404 bez tokenu, prefiks).
5. Repozytorium i widoki światów, potem osady, potem graczy; testy e2e każdego widoku.
6. README i wpis w `api-guidelines.md`.
