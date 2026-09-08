# Islanders API — wytyczne projektowe

Data: 2026-09-08
Status: zatwierdzone decyzje architektoniczne, gotowe do rozpisania na plan implementacji

## 1. Cel i zakres

Backend do gry „Islanders": mobilnego, proceduralnego MMO RTS w scenerii archipelagu.
Klient (Godot 4.8, GDScript) jest zbudowany i przetestowany; leży w `../islanders`.
Ten dokument opisuje, co backend ma robić, czego nie wolno mu zmienić i w jakiej kolejności
to budować.

Zakres pierwszej wersji: świat i jego geografia, konta graczy, osady z leniwie liczonymi
zasobami, budynki, floty z rozstrzyganiem w momencie przybycia, kolonizacja i wyprawy.

Poza zakresem pierwszej wersji: walka rozstrzygana szczegółowo (na razie wynik binarny),
sojusze, handel między graczami, ranking, czat, powiadomienia push, panel administracyjny.

## 2. Skąd pochodzi ta wiedza

Nie zaczynamy od zera. Klient ustalił i przetestował kontrakty, których backend musi
przestrzegać. Przed pisaniem kodu przeczytaj w repozytorium klienta:

| Plik | Co z niego wynika |
|---|---|
| `CONTEXT.md` | Słownik domeny: 29 pojęć z definicjami i zakazanymi synonimami. Nazwy w API mają z nim być zgodne |
| `docs/adr/0001-deterministic-world-geography.md` | Geografia liczona z seeda, tożsamość wyspy przez współrzędne, pełny załącznik z kontraktem |
| `docs/adr/0002-biome-exclusive-resources.md` | Każdy biom produkuje dokładnie dwa zasoby i dopuszcza dokładnie dwa budynki wydobywcze |
| `docs/superpowers/specs/2026-09-07-islanders-client-skeleton-design.md` | Kształt JSON-a, który klient już parsuje |
| `scripts/core/WorldGrid.gd` | Referencyjna implementacja geografii |
| `scripts/core/Settlement.gd` | Referencyjna implementacja leniwej ewaluacji zasobów |

Zasada nadrzędna: **gdzie klient i wytyczne się różnią, wygrywa klient**, bo jego zachowanie
jest pokryte 105 testami jednostkowymi i 21 sprawdzeniami end-to-end. Jeśli coś w kliencie
wygląda na błąd, zgłoś to jako zmianę w kliencie, zamiast obchodzić to w backendzie.

## 3. Decyzje architektoniczne

| Obszar | Decyzja | Dlaczego |
|---|---|---|
| Geografia | Własny szum wartościowy, wspólny dla obu stron, zamiast `FastNoiseLite` | Sekcja 4 |
| Czas serwera | Kolejka zadań z czasem przybycia (BullMQ na Redisie) | Sekcja 8 |
| Dostęp do danych | Drizzle ORM na PostgreSQL | Sekcja 6 |
| Uwierzytelnianie | JWT: krótki access token, refresh token w bazie | Sekcja 9 |
| Zasoby | Liczone leniwie przy odczycie, nigdy tickiem | Sekcja 7 |

## 4. Wspólny szum — najważniejsza część tego dokumentu

### 4.1 Dlaczego zmieniamy

ADR 0001 wymaga, żeby klient i serwer liczyły geografię bit w bit z tego samego seeda. Klient
używa dziś `FastNoiseLite` w trybie `TYPE_SIMPLEX_SMOOTH` z fraktalem FBM. Odtworzenie tego
w TypeScripcie to kilkaset linii cudzej matematyki, w której każda różnica w kolejności
działań daje inny świat, wyglądający całkowicie poprawnie. To najdroższe i najbardziej
ryzykowne miejsce w całym backendzie, a ryzyko jest niepotrzebne: szum ma tu być tylko
źródłem powtarzalnego pseudolosu, nie efektem artystycznym.

Zastępujemy go szumem wartościowym opartym na haszu, który klient już ma i który jest już
częścią kontraktu. Około trzydziestu linii, żadnych funkcji przestępnych, wyłącznie dodawanie,
mnożenie, odejmowanie i dzielenie na liczbach zmiennoprzecinkowych podwójnej precyzji, które
GDScript i TypeScript liczą identycznie, bo obie strony używają IEEE 754 binary64 i wszystkie
te działania są poprawnie zaokrąglane.

**To jest zmiana także po stronie klienta.** Zobacz sekcję 13.

### 4.2 Hasz komórki pozostaje bez zmian

Ten fragment kontraktu zostaje dokładnie taki, jaki jest dziś w kliencie i w załączniku
do ADR 0001:

```
hash_cell(world_seed, x, y):
    h = world_seed & 0x7fffffff
    h = (h * 31 + x + 1000003) & 0x7fffffff
    h = (h * 31 + y + 1000033) & 0x7fffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0x7fffffff
    return h

hash01(h) = (h % 10007) / 10007.0
```

**W TypeScripcie liczymy to wyłącznie na `BigInt`.** Iloczyn pośredni sięga 2,7 × 10^18, czyli
daleko poza `Number.MAX_SAFE_INTEGER`, a operatory bitowe JavaScriptu działają na 32 bitach.
Dosłowne przepisanie na `number` daje dla `(1337, 103, 100)` wynik `252586152` zamiast
poprawnego `252586155`, i myli się inaczej dla każdej komórki. Wynik `hash_cell` mieści się
w 31 bitach, więc konwersja do `number` na samym końcu jest bezpieczna i zalecana.

### 4.3 Szum wartościowy

```
lattice(seed, ix, iy) = hash01(hash_cell(seed, ix, iy)) * 2.0 - 1.0     # w [-1, 1)

smooth(t) = t * t * (3.0 - 2.0 * t)

value_noise(seed, x, y):
    ix = floor(x);  iy = floor(y)
    fx = x - ix;    fy = y - iy
    u = smooth(fx); v = smooth(fy)
    n00 = lattice(seed, ix,     iy)
    n10 = lattice(seed, ix + 1, iy)
    n01 = lattice(seed, ix,     iy + 1)
    n11 = lattice(seed, ix + 1, iy + 1)
    a = n00 + (n10 - n00) * u
    b = n01 + (n11 - n01) * u
    return a + (b - a) * v

fbm(seed, x, y, octaves):
    sum = 0.0;  norm = 0.0;  amp = 1.0;  freq = 1.0
    for i in 0 .. octaves - 1:
        sum  = sum + amp * value_noise(seed + i * 1013, x * freq, y * freq)
        norm = norm + amp
        amp  = amp * 0.5
        freq = freq * 2.0
    return sum / norm
```

Uwagi wiążące dla obu implementacji:

- `floor` musi być matematyczną podłogą, także dla liczb ujemnych. W TypeScripcie `Math.floor`,
  nigdy `Math.trunc`, `| 0` ani `parseInt`.
- Kolejność działań w `fbm` jest częścią kontraktu. Sumowanie w innej kolejności zmienia wynik
  na ostatnich bitach, a próg lądu potrafi to wzmocnić do różnicy „ląd albo morze".
- Sól oktawy `1013` i mnożnik amplitudy `0.5` oraz częstotliwości `2.0` są kontraktem.
- Zakres wyniku to w przybliżeniu `[-1, 1]`, ale nie dokładnie; nie polegaj na krańcach.

### 4.4 Wyznaczanie wyspy

```
land  = fbm(world_seed,     x * LAND_FREQUENCY,  y * LAND_FREQUENCY,  2)
biome = fbm(world_seed + 1, x * BIOME_FREQUENCY, y * BIOME_FREQUENCY, 1)

jest wyspa  <=>  land > LAND_THRESHOLD
biom = TROPICAL gdy biome < -BIOME_BAND
       VOLCANIC gdy biome >  BIOME_BAND
       TEMPERATE w pozostałych przypadkach
```

Stałe `LAND_FREQUENCY = 0.12`, `BIOME_FREQUENCY = 0.03` i `BIOME_BAND = 0.15` przenosimy
bez zmian. `LAND_THRESHOLD` wymagał sprawdzenia, bo nowy szum ma inny rozkład niż
`FastNoiseLite` — zmierzone na próbce 100 × 100 dla trzech seedów (1, 1337, 99999):

| próg | gęstość lądu |
|---|---|
| 0,10 | 39,5 % |
| 0,15 | 33,6 % |
| 0,20 | 28,1 % |
| 0,25 | 23,0 % |
| **0,30** | **18,1 %** |

Dotychczasowa wartość `0.30` trafia w docelowy przedział 15–20 procent, więc **zostaje bez
zmian**. Rozkład biomów na tej samej próbce: 37 % tropikalnych, 35 % umiarkowanych,
28 % wulkanicznych — bez degeneracji w jeden biom.

Promień wyspy i reguły znaleziska (rekurencyjne hasze z solami `(7, 11)`, `(3, 5)`, `(1, 1)`,
`(i + 1, 0)`, zasoby wyłącznie spoza biomu wyspy) przenosimy bez zmian z załącznika do ADR 0001.

### 4.5 Jak udowodnić zgodność

Nie ufaj temu, że obie implementacje wyglądają tak samo. Zrób test porównawczy:

1. Klient generuje plik z wynikami dla siatki co najmniej 200 × 200 komórek i kilku seedów:
   dla każdej komórki `hash_cell`, `land`, `biome`, a dla wysp `radius` i zawartość znaleziska.
2. Backend ma test, który czyta ten sam plik i sprawdza każdą pozycję.
3. Plik leży w obu repozytoriach albo w jednym, z którego drugie go pobiera. Jest artefaktem
   kontraktu, nie plikiem tymczasowym.

Ten test jest ważniejszy niż jakikolwiek inny test w backendzie. Bez niego rozjazd wyjdzie
dopiero wtedy, gdy gracz zobaczy osadę na morzu.

### 4.6 Zgodność jest już potwierdzona na prototypie

Algorytm z sekcji 4.3 nie jest propozycją na papierze. Został zaimplementowany w GDScript
i w JavaScripcie z `BigInt`, i obie strony dają identyczne wartości co do siedemnastu cyfr
znaczących, także dla ujemnych współrzędnych:

| seed, x, y | `hash_cell` | `land` | `biome` |
|---|---|---|---|
| 1337, 0, 0 | 983106472 | 0.52106858532360678 | −0.88707904466873189 |
| 1337, 103, 100 | 252586155 | −0.26560642750074925 | −0.31056894613770364 |
| 1337, −5, 7 | 575219644 | −0.48523097151887001 | −0.66758352130138876 |
| 42, 1234, −987 | 1703142128 | 0.20358594740738600 | −0.32286378155278411 |

Użyj tych czterech wierszy jako pierwszego testu, zanim zbudujesz cokolwiek innego. Jeśli się
nie zgadzają, nic dalej nie ma sensu.

Ta sama próba potwierdziła też ostrzeżenie z sekcji 4.2 na żywym przykładzie: wersja
`hash_cell` napisana na zwykłym `number`, z maskowaniem `& 0x7fffffff`, daje dla
`(1337, 103, 100)` wartość `252586152` zamiast `252586155`.

## 5. Reguły domenowe, których serwer jest strażnikiem

Klient je zna i respektuje, ale klientowi nie wolno ufać. Serwer waliduje każdą z nich:

1. **Osada tylko na lądzie.** Współrzędne, na których serwer nie widzi wyspy, są odrzucane.
   Klient ma po swojej stronie ten sam strażnik i głośno krzyczy, gdy dostanie osadę na morzu
   — to jest wykrywacz rozjazdu algorytmów, nie kosmetyka.
2. **Budynek zgodny z biomem.** Osada nie może mieć budynku wydobywczego dla zasobu spoza
   swojego biomu (ADR 0002). Dotyczy to również `productionPerHour`: serwer nie może wysłać
   niezerowej produkcji zasobu, którego biom nie produkuje.
3. **Sześć slotów.** Cztery wspólne budynki plus dwa wydobywcze wynikające z biomu.
4. **Pojemność magazynu.** Zasoby obcinane z góry do `capacity` osobno dla każdego zasobu,
   z dołu do zera.
5. **Populacja to limit, nie zasób.** Nie rośnie w czasie, nie konsumuje jedzenia, ogranicza
   rekrutację.
6. **Kolonizacja wymaga osadnika** we flocie z misją `COLONIZE`; osadnik jest zużywany.
   Gdy wyspa okazała się zajęta w chwili przybycia, flota wraca.
7. **Znalezisko istnieje tylko na wyspie bez osady** i zawiera wyłącznie zasoby spoza biomu
   tej wyspy.
8. **Flota jest jednokierunkowa.** Powrót to nowa flota, tworzona przez serwer.
9. **Prędkość floty to prędkość najwolniejszego statku**, a wiatr wpływa na czas podróży
   wyłącznie w chwili wypłynięcia. Wypłynięta flota ma zamrożony czas przybycia.

## 6. Model danych

PostgreSQL przez Drizzle ORM. Migracje w repozytorium, generowane z definicji schematu,
uruchamiane w CI przed testami e2e.

Tabele pierwszej wersji:

- `worlds` — `id`, `seed`, `width`, `height`, `wind_x`, `wind_y`, `status` (`OPEN`, `CLOSED`,
  `ENDED`), `created_at`. Wiatr zmieniany okresowo, historia niepotrzebna.
- `players` — `id`, `email`, `password_hash`, `created_at`. Konto globalne, ponad światami.
- `world_players` — `world_id`, `player_id`, `home_x`, `home_y`, `joined_at`. Profil gracza
  na konkretnym świecie.
- `settlements` — klucz główny złożony `(world_id, x, y)`. Kolumny: `owner_id`, `name`,
  zasoby jako pięć kolumn `numeric`, `capacity`, `population`, `population_max`,
  `last_sync_at`. **Bez własnego `id`** — tożsamością osady jest jej pozycja (ADR 0001).
- `buildings` — `(world_id, x, y, type)` i `level`. Osobna tabela zamiast JSON-a, bo
  ograniczenie „budynek zgodny z biomem" ma być egzekwowane w bazie.
- `fleets` — `id`, `world_id`, `owner_id`, `mission`, `from_x`, `from_y`, `to_x`, `to_y`,
  `ships` (jsonb), `cargo` (jsonb), `depart_at`, `arrive_at`, `resolved_at`.
- `deposits_taken` — `(world_id, x, y)` i ile już zabrano. Samo znalezisko wynika z seeda;
  w bazie trzymamy wyłącznie odchylenie od stanu wyliczonego.
- `refresh_tokens` — `id`, `player_id`, `token_hash`, `expires_at`, `revoked_at`.

Zasada przewijająca się przez cały schemat: **w bazie trzymamy tylko to, czego nie da się
wyliczyć z seeda.** Geografia, biom, promień i pierwotna zawartość znaleziska są funkcją
`(world_seed, x, y)` i nie mają swoich wierszy.

Zasoby jako `numeric`, nie `float`, bo są pieniędzmi tej gry i mają się sumować bez dryfu.

## 7. Czas, zasoby i autorytet serwera

Zasoby liczone są **leniwie przy odczycie**, dokładnie tą samą formułą co u klienta:

```
current = clamp(stored + production_per_hour * (now - last_sync_at) / 3600, 0, capacity)
```

Serwer materializuje ten wynik i przestempluje `last_sync_at` tylko wtedy, gdy coś faktycznie
wydaje albo dolicza zasoby: rozbudowa budynku, rekrutacja, załadunek floty, rozładunek.
Zwykły odczyt niczego nie zapisuje.

W odpowiedzi API zwraca **stan wraz ze znacznikiem czasu**, a nie wyłącznie liczbę. Klient
ekstrapoluje między odpytaniami i tak jest zaprojektowany; odbieranie mu `lastSyncAt`
zepsułoby płynny licznik w HUD.

Każda odpowiedź niesie `serverTime` w ISO 8601 UTC. Klient kalibruje po niej swój zegar, więc
to nie jest pole diagnostyczne, tylko część kontraktu.

Wszystkie znaczniki czasu w API są ISO 8601 UTC ze strefą `Z`. Bez czasu lokalnego, bez
uniksowych sekund.

## 8. Rozstrzyganie flot

Flota planuje zadanie w kolejce (BullMQ na Redisie) na moment `arrive_at`. Rozstrzygnięcie
jest jedynym miejscem, które zmienia stan po przybyciu, i wygląda tak:

1. Zablokuj wiersze obu osad w jednej transakcji, w ustalonej kolejności współrzędnych,
   żeby dwie floty przybywające jednocześnie nie zakleszczyły się.
2. Zmaterializuj zasoby celu na moment przybycia, nie na „teraz".
3. Rozstrzygnij misję: `TRANSPORT` rozładowuje, `EXPEDITION` zabiera część znaleziska,
   `COLONIZE` zakłada osadę albo zawraca, `ATTACK` rozstrzyga starcie, `RETURN` rozładowuje
   w osadzie macierzystej.
4. Jeśli coś ma wrócić, utwórz nową flotę z misją `RETURN` i zaplanuj jej zadanie.
5. Ustaw `resolved_at` i zwolnij transakcję.

Wymagania na to miejsce:

- **Idempotencja.** Zadanie może wykonać się dwa razy po restarcie. `resolved_at` jest
  strażnikiem, sprawdzanym wewnątrz transakcji.
- **Odporność na przestój.** Po starcie serwer przemiata floty z `arrive_at` w przeszłości
  i `resolved_at IS NULL`, i rozstrzyga je w kolejności `arrive_at`. Kolejność ma znaczenie,
  bo atak może zmienić wynik następnego.
- **Czas przybycia liczy serwer** przy wypłynięciu, z dystansu, prędkości najwolniejszego
  statku i ówczesnego wiatru. Klient go nigdy nie przelicza; jego `SeaNavigation.travel_time`
  służy wyłącznie do pokazania szacunku przed wysłaniem.

## 9. Uwierzytelnianie i reguły informacyjne

JWT: access token krótkożyjący (15 minut), refresh token w bazie jako hasz, z możliwością
unieważnienia. Hasła przez argon2id.

**Reguły informacyjne są częścią kontraktu, nie dodatkiem.** Klient ma je zaimplementowane
i recenzja potwierdziła, że ich nie łamie; serwer nie może mu przysłać danych, których gracz
nie powinien widzieć, bo wtedy wyciek jest po stronie API:

| Dane | Kto widzi |
|---|---|
| Geografia, biom, znalezisko | wszyscy |
| Nazwa osady i jej właściciel | wszyscy |
| Zasoby, budynki, populacja, magazyn | wyłącznie właściciel |
| Garnizon | wyłącznie właściciel |
| Flota w drodze | właściciel, oraz właściciel celu gdy to atak na jego osadę |

Cudza osada wraca do klienta **bez klucza `resources`** — klient rozpoznaje po jego obecności,
że osada jest jego własna. To nie jest szczegół implementacyjny klienta, tylko kontrakt: nie
wysyłaj `resources: {}` dla cudzej osady, bo klient uzna ją za swoją.

Limity zapytań na kluczowych endpointach, bo klient odpytuje co 60 sekund, a mapa jest
publiczna.

## 10. Powierzchnia API

Wszystkie ścieżki pod `/api/v1`, wszystkie poza logowaniem wymagają tokenu i są zakresowane
do świata.

```
POST   /auth/register                 rejestracja konta
POST   /auth/login                    logowanie, zwraca access + refresh
POST   /auth/refresh                  odnowienie access tokenu
POST   /auth/logout                   unieważnienie refresh tokenu

GET    /worlds                        lista światów ze statusem
POST   /worlds/:id/join               dołączenie, tworzy osadę domową

GET    /worlds/:id/state              świat, profil gracza, wiatr, serverTime
GET    /worlds/:id/settlements        własne osady w pełni, cudze jako dane publiczne
GET    /worlds/:id/settlements?bbox=  osady w prostokącie mapy, dane publiczne
GET    /worlds/:id/fleets             floty własne oraz nadchodzące na własne osady

POST   /worlds/:id/settlements/:x/:y/buildings/:type/upgrade
POST   /worlds/:id/settlements/:x/:y/recruit
POST   /worlds/:id/fleets             wysłanie floty
DELETE /worlds/:id/fleets/:fleetId    zawrócenie floty
```

Kształt odpowiedzi dla świata, osady i floty ma odpowiadać temu, co klient już parsuje —
sekcja 4 specyfikacji klienta zawiera dokładne przykłady. Klucze w `camelCase`, współrzędne
jako `{"x": int, "y": int}`, znaczniki czasu w ISO 8601 UTC.

Endpoint mapy przyjmuje prostokąt, bo klient ładuje świat kawałkami i nigdy nie potrzebuje
wszystkich osad naraz. Bez tego pierwszy popularny świat położy zapytanie listujące.

## 11. Testy

Backend ma być trzymany na tym samym poziomie dowodu co klient: twierdzenie bez wyjścia
komendy nie jest dowodem.

- **Test zgodności geografii z klientem** (sekcja 4.5) — najważniejszy test w projekcie.
- **Testy jednostkowe** czystej logiki: hasz, szum, wyznaczanie wyspy, leniwe zasoby,
  czas podróży, reguły biomów. Bez bazy, bez sieci.
- **Testy integracyjne** rozstrzygania flot: dwie floty przybywające w tej samej sekundzie,
  kolonizacja wyspy zajętej sekundę wcześniej, rozstrzygnięcie po restarcie, powtórzone
  zadanie z kolejki.
- **Testy e2e** przez HTTP na prawdziwej bazie w kontenerze, obejmujące reguły informacyjne:
  test, który dowodzi, że w odpowiedzi o cudzą osadę nie ma pola `resources`.
- Vitest jest już skonfigurowany, oddzielnie dla testów jednostkowych i e2e.

## 12. Kolejność prac

1. Szkielet: konfiguracja, Drizzle, migracje, kontener z bazą, zdrowie aplikacji.
2. Geografia: hasz, szum, wyznaczanie wyspy, znalezisko — plus test zgodności z klientem.
   **Dopóki ten krok nie jest zielony, nie ma sensu budować niczego wyżej.**
3. Konta i JWT.
4. Świat, dołączanie, osada domowa.
5. Odczyty: stan świata, osady z regułami informacyjnymi, mapa po prostokącie.
6. Zasoby leniwie i materializacja przy wydatkach.
7. Budynki: rozbudowa z walidacją biomu i kosztów.
8. Floty: wysyłka, kolejka, rozstrzyganie, powrót.
9. Kolonizacja i wyprawy.
10. Limity zapytań, logowanie zdarzeń, metryki.

## 13. Praca wynikająca z tych wytycznych po stronie klienta

Decyzja o własnym szumie oznacza zmianę w repozytorium klienta. Zanim backend zacznie
implementować geografię, w kliencie trzeba:

1. Zastąpić `FastNoiseLite` w `scripts/core/WorldGrid.gd` szumem z sekcji 4.3.
2. Wyznaczyć nowy `LAND_THRESHOLD` pomiarem gęstości lądu.
3. Zaktualizować złote testy w `test/core/world_grid_test.gd` i fixtures, których współrzędne
   muszą nadal wypadać na lądzie.
4. Przepisać sekcje 2 i 3 załącznika do ADR 0001 i dopisać, dlaczego `FastNoiseLite` odpadł.
5. Wygenerować plik referencyjny dla testu zgodności (sekcja 4.5).

`CoastlineGenerator` zostaje na `FastNoiseLite` — kształt wybrzeża jest czysto kliencki i nie
jest częścią kontraktu.
