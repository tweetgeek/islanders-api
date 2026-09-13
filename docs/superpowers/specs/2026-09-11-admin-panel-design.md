# Islanders API — panel administracyjny (podgląd)

Data: 2026-09-11, przepisany 2026-09-13 po przesłuchaniu
Status: **wstrzymany.** Ustalenia zapisane, plan implementacji nie powstaje.
Powód wstrzymania: API gry zmienia się pod nowe założenia, a panel czyta jego dane i
przejmuje jego pojęcia, więc projekt panelu trzeba przejrzeć po tych zmianach.
Zależności: spec A (wdrożony), spec B (`2026-09-11-settlement-economy-design.md`, w toku).
Terminologia: `../islanders/CONTEXT.md`.

## 0. Jak czytać ten dokument

Pierwsza wersja specu (commit `9357f94`) zakładała panel renderowany po stronie serwera,
bez JavaScriptu. Przesłuchanie zmieniło tę decyzję: panel jest aplikacją jednostronicową
(SPA) w Vue. Dokument opisuje stan po tej zmianie i nie zachowuje wariantu serwerowego,
bo nikt do niego nie wróci. Sekcja 10 wymienia pytania, na które nie ma jeszcze odpowiedzi.

## 1. Cel i zakres

Deweloperskie narzędzie do podglądu stanu gry: światów, graczy, profili, osad, budynków,
flot i mapy świata. Wyłącznie odczyt, żadnych akcji zmieniających stan.

Panel istnieje tylko wtedy, gdy w `.env` jest ustawiony sekret `ADMIN_TOKEN`, i tylko poza
`NODE_ENV=production`. Sekret ma jedno zadanie: zamknąć dostęp z zewnątrz do serwera
chodzącego lokalnie. Nie jest tokenem sesyjnym, nie rotuje się i nie wygasa.

Poza zakresem:

- akcje zmieniające stan (status świata, tworzenie świata, edycja zasobów, unieważnianie
  sesji graczy);
- paginacja i filtrowanie list;
- praca na produkcji;
- rola administratora przypięta do konta gracza w bazie;
- tokeny odświeżające graczy — panel nie pokazuje ich w ogóle (sekcja 2, wiersz 7);
- garnizon i kolejka zleceń osady do czasu wdrożenia specu B (sekcja 5.4).

## 2. Rozstrzygnięcia

Kolejność odpowiada kolejności rozstrzygania; każdy wiersz to decyzja podjęta świadomie,
wraz z tym, co z niej wynika.

| # | Pytanie | Decyzja | Konsekwencja |
|---|---|---|---|
| 1 | Kto ma dostęp | Flaga i sekret w `.env`, bez ról w bazie | Brak migracji, jeden administrator |
| 2 | Jak powstaje UI | **SPA w Vue 3** (zmiana wobec pierwszej wersji specu) | Backend wystawia JSON, widoki żyją w osobnym projekcie |
| 3 | Co widać | Wyłącznie podgląd | Brak tras zapisujących |
| 4 | Gdzie działa | Tylko lokalnie i w dev | `ADMIN_TOKEN` w `production` to błąd startu |
| 5 | Skąd dane | Własne repozytorium odczytów w module admina | Repozytoria graczy nie dostają metod „dla admina” |
| 6 | Słownictwo | Polskie nazwy ze słownika domeny | „konto” zastąpione przez „gracz”; etykiety polskie, nie nazwy kolumn |
| 7 | Tokeny odświeżające graczy | Nie ma ich w panelu | Znika kolumna „aktywne tokeny” i tabela tokenów |
| 8 | E‑mail gracza | Pokazywany bez maskowania | Odróżnianie kont testowych; maskowanie byłoby pozorne |
| 9 | Floty rozstrzygnięte | Dwie osobne tabele: w drodze i historia przybyć | Historia to dziennik, nie floty (sekcja 5.2) |
| 10 | Historia przybyć | Ostatnie 50, tylko w szczegółach świata | Szczegóły gracza pokazują wyłącznie floty w drodze |
| 11 | Osada domowa bez osady | Panel sprawdza i wypisuje niezgodność | Bez klucza obcego baza tego nie wyłapie (sekcja 5.1) |
| 12 | Geografia | Pełna mapa świata z zoomem | Nowy ekran mapy, dane z seeda (sekcje 6–7) |
| 13 | Framework | Vue 3, Vite, Tailwind 4, TypeScript, bez Inertii | Zgodne ze stosem `Filaments-backend` |
| 14 | Gdzie kod | `admin-ui/` z własnym `package.json` | Zależności frontendu nie wchodzą do drzewa serwera |
| 15 | Serwowanie | Nest serwuje `admin-ui/dist` pod `/admin`; `dist` nie idzie do gita | `npm run admin:build`; w dev Vite na 5173 z proxy |
| 16 | Uwierzytelnienie | Token w nagłówku `Authorization`, trzymany w `localStorage` | Brak ciasteczka i HMAC; `GET /admin/api/session` sprawdza token |
| 17 | Kształt API | Jeden endpoint na ekran | Payload dopasowany do widoku, jeden test na endpoint |
| 18 | Dane mapy | Jedno żądanie na świat, `ETag` i `immutable` | Zoom i przesuwanie bez żądań |
| 19 | Rysowanie mapy | Canvas 2D, własny zoom i przesuwanie | Bez biblioteki mapowej; skaluje się na większe światy |
| 20 | Warstwy mapy | Biomy, osady, znaleziska; podpowiedź i panel boczny; floty domyślnie wyłączone | Sekcja 7 |
| 21 | Testy panelu | Playwright w przeglądarce | Sekcja 9 |
| 22 | Orkiestracja testów | Jedna komenda z Testcontainers i zasianymi danymi, Chromium bez okna | Asercje mogą być dokładne |
| 23 | Miejsce API | `/admin/api/*` poza prefiksem `api/v1`, wykluczone ze Swaggera | Panel nie wchodzi do kontraktu gry |

Odrzucone warianty warte zapamiętania: HTML renderowany po stronie serwera (odrzucony
dopiero na etapie mapy z zoomem), React 19 (obecny w innych projektach, ale Vue jest
świeższy w rękach), osobne repozytorium panelu, geografia liczona w przeglądarce przez
import `src/domain/geography` (odrzucona, żeby nie liczyć jej w dwóch miejscach), SVG
zamiast canvasu, biblioteka mapowa, `Administrator` jako termin w słowniku domeny
(odrzucony, bo to mechanizm dostępu, a nie pojęcie gry).

## 3. Konfiguracja

Jedna nowa zmienna w `src/infra/config/env.ts`:

| Zmienna | Typ | Reguła |
|---|---|---|
| `ADMIN_TOKEN` | string, opcjonalna | Gdy ustawiona: minimum 16 znaków. Gdy ustawiona przy `NODE_ENV=production`: `EnvValidationError` z komunikatem, że panel jest narzędziem deweloperskim |

Transformacja schematu dodaje wyliczone `ADMIN_ENABLED: boolean`, prawdziwe wtedy i tylko
wtedy, gdy `ADMIN_TOKEN` jest ustawiony. Sekret jest jednocześnie flagą: nie da się włączyć
panelu bez sekretu ani zostawić sekretu bez włączenia panelu.

`.env.example` dostaje zakomentowany wpis z podpowiedzią `openssl rand -base64 24`, żeby
świeża kopia pliku nie włączała panelu.

`AppModule.forRoot(env)` importuje `AdminModule` wyłącznie gdy `env.ADMIN_ENABLED`; przy
wyłączonym panelu trasy `/admin/*` nie istnieją i dają 404, a nie „istnieją i odmawiają”.

`configureApp` wyklucza panel z globalnego prefiksu:

```ts
app.setGlobalPrefix('api/v1', { exclude: ['admin', 'admin/{*path}'] });
```

Wykluczenie jest bezwarunkowe: dotyczy tylko dopasowania prefiksu, a bez modułu nie ma czego
dopasować. Test e2e sprawdza, że `/api/v1/health` działa w obu konfiguracjach.

## 4. Uwierzytelnienie

Token jedzie w nagłówku `Authorization: Bearer <ADMIN_TOKEN>` przy każdym żądaniu do
`/admin/api/*`. Panel po wpisaniu sekretu w ekranie logowania zapisuje go w `localStorage`
i dokłada do każdego żądania.

- `AdminGuard` porównuje nagłówek z `ADMIN_TOKEN` przez `timingSafeEqual` na buforach równej
  długości; różna długość to odrzucenie bez porównywania. Brak lub zły token: 401 z JSON‑em.
- `GET /admin/api/session` nie zwraca nic poza `{ ok: true }`. Panel woła ją przy starcie,
  żeby sprawdzić zapamiętany token, i na podstawie 200 albo 401 decyduje, czy pokazać
  ekran logowania.
- Wylogowanie to wyczyszczenie `localStorage` w przeglądarce; serwer nie ma czego unieważniać.
- Trasy panelu są `@Public()` (wyłączają globalny `JwtAuthGuard`) i `@ApiExcludeController()`.

Świadoma konsekwencja: sekret jest dostępny JavaScriptowi panelu i leży w pamięci
przeglądarki. Przy panelu deweloperskim na localhoście to akceptowalne; gdyby panel miał
kiedyś stanąć na produkcji, wraca ciasteczko `HttpOnly` (odrzucony wariant z pierwszej wersji).

## 5. Ekrany danych

Wszystkie dane przez `/admin/api/*`, jeden endpoint na ekran. Etykiety po polsku, zgodnie ze
słownikiem: świat, gracz, profil, osada, flota, budynek, zasób, pseudonim, osada domowa.
Czasy w ISO 8601 UTC, jak w API gry. Listy bez paginacji, sortowane rosnąco po identyfikatorze.

### 5.1 Światy i gracze

| Endpoint | Ekran |
|---|---|
| `GET /admin/api/worlds` | Lista światów: id, seed, szerokość × wysokość, wiatr, status, liczba profili, liczba osad, utworzono |
| `GET /admin/api/worlds/:id` | Świat: pola świata, profile (gracz, osada domowa, dołączył), osady (pozycja, nazwa, właściciel, biom, populacja, zasoby, ostatnia synchronizacja, założona), floty w drodze, historia przybyć (50) |
| `GET /admin/api/worlds/:id/settlements/:x/:y` | Osada: właściciel, biom, zasoby „w bazie” i „teraz”, pojemność, produkcja na godzinę, populacja i limit, budynki z poziomami |
| `GET /admin/api/players` | Lista graczy: id, pseudonim, e‑mail, zarejestrowany, liczba profili |
| `GET /admin/api/players/:id` | Gracz: pola konta, profile (świat, osada domowa, dołączył), osady na wszystkich światach, floty w drodze |

Osada domowa profilu jest sprawdzana: gdy pod `home_x, home_y` nie ma osady, pole niesie
informację „brak osady pod (x, y)”; gdy osada jest, ale należy do innego gracza, „należy do
innego gracza”. Link do ekranu osady tylko wtedy, gdy jedno i drugie się zgadza. `profiles`
nie ma klucza obcego do `settlements`, więc to jedyne miejsce, które taki rozjazd wyłapie.

Wartości wyliczone (zasoby „teraz”, pojemność, produkcja, limit populacji) liczy `ownView`
z `src/modules/settlements/settlement-views.ts` z czasem z `Clock` wstrzykiwanego przez
`CLOCK`. Panel nie liczy niczego sam; rozjazd panelu z API oznaczałby błąd w danych.

### 5.2 Floty w drodze a historia przybyć

Słownik mówi, że flota po przybyciu przestaje istnieć, a ewentualny powrót to nowa flota.
Baza jednak nie usuwa wiersza, tylko wypełnia `resolved_at`. Panel oddziela te dwa byty:

- **Floty** to wiersze z `resolved_at IS NULL`. Tabela pokazuje misję, właściciela, trasę,
  wypłynięcie i przybycie.
- **Historia przybyć** to ostatnie 50 wierszy z wypełnionym `resolved_at`, malejąco po
  `arrive_at`, wyłącznie w szczegółach świata. To dziennik zdarzeń, nie floty, i panel nie
  nazywa go flotami.

### 5.3 Repozytorium

`AdminRepository` ma jedną metodę na ekran (`listWorlds`, `worldDetail`, `settlementDetail`,
`listPlayers`, `playerDetail`, `worldMap`). Zliczenia robi SQL przez `count()` z `GROUP BY`
albo podzapytania, pseudonimy właścicieli przez `JOIN`; żadnych zapytań w pętli po wierszach.
Metody szczegółów zwracają `undefined`, gdy encji nie ma, a kontroler zamienia to na 404.
Wyłącznie `SELECT`.

### 5.4 Miejsce na spec B

Po wdrożeniu specu B ekran osady dostaje garnizon (`military_type`, liczba) i kolejkę zleceń
(rodzaj, pozycja, ładunek, koszt, start, koniec, rozstrzygnięcie). To dwa zapytania i dwie
sekcje widoku; nic w tym specu nie musi się zmienić.

## 6. Dane mapy

`GET /admin/api/worlds/:id/map` zwraca komplet dla jednego świata:

- wyspy policzone z seeda funkcjami `src/domain/geography`: współrzędne, biom, promień,
  znalezisko;
- nakładkę z bazy: osady (pozycja, nazwa, właściciel) i pobrane znaleziska
  (`deposits_taken`).

Pomiar na świecie 200 × 200: 40 000 komórek, 6063 wyspy (15,2%), 1802 ze znaleziskiem,
22 ms na policzenie całej mapy. Odpowiedź waży poniżej pół megabajta.

Geografia świata nigdy się nie zmienia, więc odpowiedź dostaje `ETag` i `Cache-Control:
immutable`. Zoom i przesuwanie nie generują żadnych żądań. Ostrożność: część nakładki
(osady, pobrane znaleziska) zmienia się w czasie, więc `ETag` musi zależeć także od niej
albo nakładka musi jechać osobnym, niecache'owanym żądaniem. Do rozstrzygnięcia przy
wznowieniu prac (sekcja 10).

## 7. Ekran mapy

Canvas 2D, zoom kółkiem, przesuwanie przeciąganiem, przeliczanie ekran ↔ świat własnym kodem.

Warstwy przełączane polami wyboru:

1. **Biomy** — kolor wyspy na tle morza. Podkład, zawsze włączony.
2. **Osady** — znaczniki na wyspach z osadą.
3. **Znaleziska** — małe kropki na wyspach niczyich ze znaleziskiem.
4. **Floty w drodze** — linie ze strzałką od źródła do celu. Domyślnie wyłączona.

Najechanie kursorem pokazuje podpowiedź: współrzędne, biom, a dla osady nazwę i pseudonim
właściciela. Kliknięcie otwiera panel boczny ze szczegółami komórki i linkiem do ekranu osady.

## 8. Projekt frontendu

```
admin-ui/
  package.json          własne zależności: vue, vue-router, vite, tailwindcss, vitest
  vite.config.ts        proxy /admin/api -> http://localhost:3000 w dev
  index.html
  src/
    main.ts, App.vue, router.ts
    api.ts              fetch z nagłówkiem Authorization, obsługa 401
    views/              Login, Worlds, World, Settlement, Players, Player, Map
    map/                canvas: rysowanie, zoom, przeliczanie współrzędnych (czyste funkcje)
    components/         tabele, panel boczny, przełączniki warstw
```

Backend serwuje `admin-ui/dist` pod `/admin` (statycznie, z przekierowaniem nieznanych
ścieżek na `index.html`, bo router SPA używa ścieżek). `dist` nie jest commitowany; brak
builda daje krótką stronę z instrukcją `npm run admin:build`. W korzeniu dochodzą skrypty
`admin:build` i `admin:dev`.

## 9. Testy

- **Backend, jednostkowe:** `ADMIN_TOKEN` w `env.spec.ts` (brak, za krótki, w `production`,
  poprawny), porównanie tokenu w strażniku (odrzuca inną długość bez rzucania).
- **Backend, e2e (supertest):** każdy endpoint `/admin/api/*` bez tokenu → 401, ze złym → 401,
  z dobrym → 200 z oczekiwanym kształtem; nieistniejący świat, gracz i osada → 404; osada
  domowa wskazująca w pustkę → pole z niezgodnością; historia przybyć obcięta do 50;
  `/api/v1/health` działa z panelem i bez niego; aplikacja bez `ADMIN_TOKEN` → `/admin/api/*`
  daje 404.
- **Frontend, jednostkowe (vitest w `admin-ui`):** czyste funkcje mapy — przeliczanie
  ekran ↔ świat, wybór komórki pod kursorem, dobór kolorów biomów, formatowanie.
- **Przeglądarka (Playwright, Chromium, bez okna):** jedna komenda `npm run test:ui`.
  `webServer` uruchamia skrypt, który podnosi Postgresa przez Testcontainers, robi migracje,
  zasiewa deterministyczne dane (świat o stałym seedzie, dwóch graczy, ich osady i floty),
  a potem startuje Nesta z `ADMIN_TOKEN` i zbudowanym panelem. Ścieżka: logowanie złym
  tokenem, logowanie dobrym, lista światów, szczegóły świata, mapa (zoom, kliknięcie w osadę,
  panel boczny), ekran osady, lista graczy, szczegóły gracza. Dane są stałe, więc asercje
  są dokładne.

## 10. Pytania bez odpowiedzi

Do rozstrzygnięcia przy wznowieniu prac, po zmianach w API:

1. **Limit zapytań na trasach panelu.** Token jedzie w każdym żądaniu, więc zgadywanie biłoby
   w dowolny endpoint. Warianty: bez limitera (sekret 16+ znaków, serwer na localhoście),
   `@RateLimit('ip')` z istniejącym limitem 10/min (ryzyko 429 przy zwykłym odświeżaniu),
   nowa zmienna `ADMIN_RATE_LIMIT_PER_MINUTE` domyślnie 60.
2. **`ETag` dla mapy wobec zmiennej nakładki** (sekcja 6): wspólny `ETag` zależny od osad
   i pobranych znalezisk, czy rozdzielenie na dwa żądania.
3. **Czy testy jednostkowe komponentów Vue** (`@vue/test-utils`, `happy-dom`) mają istnieć
   obok Playwrighta, czy Playwright wystarcza.
4. **Kształt odpowiedzi błędów** `/admin/api/*`: ten sam JSON co w API gry (`statusCode`,
   `error`, `message`), czy własny, prostszy kształt dla panelu.
5. **Wpływ nadchodzących zmian w API gry** na ekrany z sekcji 5 — to powód wstrzymania prac.

## 11. Poprawki wobec pierwszej wersji specu

Zapisane, żeby nie wróciły przy wznowieniu:

- `@Header` w Nest jest dekoratorem metody, nie klasy (pierwsza wersja stawiała go na
  kontrolerze). Przy SPA problem znika: JSON nie wymaga ustawiania typu treści ręcznie.
- Ciasteczko, HMAC sesji, parsowanie nagłówka `Cookie`, filtr zamieniający wyjątki na HTML
  i widoki składane tagiem `html` — wszystko to odpada razem z wariantem serwerowym.
- „Konto” jako nazwa gracza wypada ze słownictwa panelu (słownik każe unikać „account”).

## 12. Kolejność prac (gdy wznowimy)

1. `ADMIN_TOKEN` w `env.ts` z testami, `.env.example`, wykluczenie prefiksu w `configureApp`.
2. `AdminGuard` z testem porównania tokenu, `GET /admin/api/session`, warunkowa rejestracja
   modułu, pierwsze testy e2e (401, 404 bez tokenu, nietknięty prefiks).
3. `AdminRepository` i endpointy światów, potem osady, potem graczy; test e2e na endpoint.
4. `GET /admin/api/worlds/:id/map` z `ETag`.
5. Szkielet `admin-ui`: Vite, Tailwind, router, ekran logowania, lista światów.
6. Pozostałe ekrany tabelaryczne.
7. Ekran mapy: rysowanie, zoom, warstwy, panel boczny, testy jednostkowe funkcji mapy.
8. Serwowanie `dist` z Nesta, skrypty `admin:build` i `admin:dev`.
9. Playwright z orkiestracją z sekcji 9.
10. README i wpis w `docs/api-guidelines.md`.
