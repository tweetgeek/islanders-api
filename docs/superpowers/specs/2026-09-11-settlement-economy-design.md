# Islanders API — spec B: ekonomia osady

Data: 2026-09-11
Status: zatwierdzony w brainstormingu, czeka na plan implementacji
Poprzednik: `docs/superpowers/specs/2026-09-08-backend-foundation-geography-design.md` (spec A, wdrożony)
Źródło decyzji: `docs/api-guidelines.md` sekcje 5-7, plus rozstrzygnięcia z tej sesji.

Terminologia zgodna z `../islanders/CONTEXT.md`. Gdzie klient i ten spec się różnią, wygrywa klient.

## 1. Cel i zakres

Drugi z trzech speców backendu. Dostarcza ekonomię osady: materializację zasobów przy
wydatkach, formuły balansu, kolejkę zleceń rozbudowy i rekrutacji oraz garnizon.

Po wdrożeniu gracz może rozbudowywać budynki, rekrutować wojsko, oglądać i anulować kolejkę,
a jego zasoby są naliczane i wydawane poprawnie także wtedy, gdy serwer był w międzyczasie
wyłączony.

Poza zakresem (spec C): floty, kolonizacja, wyprawy, walka, zmiany wiatru, przenoszenie
osady domowej po jej utracie.

### 1.1 Co ten spec zmienia w zastanym stanie

- Redis i BullMQ wchodzą tutaj, nie w specu C. Kontener Redisa stoi w `docker-compose.yml`
  od Etapu 0, a `REDIS_URL` jest walidowany od Task 1, ale dotąd nic ich nie czytało.
  Spec C odziedziczy gotowy mechanizm zadań dla flot zamiast budować go po raz drugi.
- `WorldWritableGuard`, zbudowany i przetestowany w specu A bez ani jednego konsumenta,
  dostaje swoje pierwsze trasy.
- `settlements.population` przestaje być kolumną (sekcja 3).

## 2. Rozstrzygnięcia, z których wynika reszta

| Pytanie | Decyzja | Konsekwencja |
|---|---|---|
| Ile rozbudów naraz | Kolejka kilku zleceń na osadę | Własna tabela, endpoint anulowania, praca po stronie klienta (sekcja 8) |
| Jak zlecenie wchodzi w życie | Zadanie w kolejce na moment ukończenia | Redis i BullMQ w specu B; idempotencja i odporność na przestój tutaj |
| Czy rekrutacja trwa w czasie | Tak, osobna kolejka, wspólny mechanizm | Jedna tabela zleceń z rozróżnikiem rodzaju |
| Skąd formuły balansu | Rodzina wykładnicza, stałe robocze | Kalibracja to osobny przebieg, nie część tego specu |
| Anulowanie | Pełny zwrot, tylko dla nierozpoczętych | Koszt płacony przy zakolejkowaniu, migawka kosztu w wierszu zlecenia |
| Zestaw wojska | Minimalny, dokładnie to co zna klient | Cztery typy, bez rozstrzygania różnic w walce |

## 3. Model danych

Dwa nowe typy wyliczeniowe: `order_kind` (`BUILD`, `RECRUIT`) i `military_type`
(`SETTLER`, `MILITIA`, `SLOOP`, `GALLEON`).

### 3.1 `settlement_orders`

Klucz główny `id uuid`. Kolumny:

| Kolumna | Typ | Uwagi |
|---|---|---|
| `world_id`, `x`, `y` | `integer` | klucz obcy do `settlements`, `ON DELETE CASCADE` |
| `kind` | `order_kind` | rozróżnik ładunku |
| `position` | `integer` | miejsce w kolejce osady, w obrębie rodzaju |
| `building_type` | `building_type` nullable | tylko dla `BUILD` |
| `target_level` | `integer` nullable | tylko dla `BUILD` |
| `military_type` | `military_type` nullable | tylko dla `RECRUIT` |
| `count` | `integer` nullable | tylko dla `RECRUIT` |
| `cost_wood` … `cost_sulfur` | `numeric(14,4)` | migawka kosztu, na potrzeby zwrotu |
| `started_at`, `finish_at` | `timestamptz` nullable | wypełnione wyłącznie dla zlecenia biegnącego |
| `resolved_at` | `timestamptz` nullable | strażnik idempotencji |
| `created_at` | `timestamptz` | |

Ograniczenie `CHECK` wymusza, że dla `BUILD` wypełniony jest komplet budowlany, a militarny
jest pusty, i odwrotnie. Baza pilnuje spójności ładunku, tak jak dziś pilnuje reguły
„budynek zgodny z biomem" (ADR 0001).

Indeks na `(world_id, x, y, kind, position)` oraz częściowy na `resolved_at IS NULL`
z `finish_at`, pod przemiatanie po restarcie.

**Jedna tabela, dwie niezależne kolejki.** `position` numeruje się w obrębie rodzaju, więc
osada ma osobną kolejkę budowy i osobną rekrutacji. Czoło każdej z nich biegnie niezależnie:
gracz może jednocześnie rozbudowywać magazyn i szkolić milicję. Rozróżnik rodzaju dzieli
kolejki logicznie, a wspólna tabela dzieli mechanizm — idempotencję, przemiatanie po
restarcie, anulowanie i przesuwanie pozycji pisze się raz.

### 3.2 `garrisons`

Dokładnie ten sam kształt co `buildings`: klucz `(world_id, x, y, type)`, kolumna
`count integer` z `CHECK >= 0`, klucz obcy do `settlements` z kaskadą. Ta symetria nie jest
kosmetyką — pozwoli specowi C przenosić jednostki między garnizonem a flotą tym samym
wzorcem zapytań, którym spec A czyta poziomy budynków.

### 3.3 Populacja przestaje być kolumną

`settlements.population` jest dziś przechowywane i zawsze zerowe. Populacja to suma miejsc
zajętych przez garnizon, przez jednostki we własnych flotach i przez zlecenia rekrutacji
czekające w kolejce — czyli wielkość wyliczalna. Zasada schematu mówi, że w bazie trzymamy
wyłącznie to, czego wyliczyć się nie da, więc kolumna znika migracją, a wartość liczy się
przy odczycie, tak jak spec A zrobił z pojemnością magazynu i limitem populacji.

## 4. Formuły balansu

**Wszystkie liczby są robocze**, w jednym pliku, oznaczone tak samo jak wartości ze specu A.
Kalibracja to osobny przebieg z prawdziwą rozgrywką.

### 4.1 Rozbudowa

```
koszt(budynek, poziom)  = bazowyKoszt[budynek] * WZROST_KOSZTU^(poziom - 1)   → w górę do całkowitej
czas(budynek, poziom)   = bazowyCzas[budynek]  * WZROST_CZASU^(poziom - 1)    → w górę do sekundy
produkcja(budynek, poz) = BASE_RATE[budynek] * poziom                          (bez zmian ze specu A)
```

`WZROST_KOSZTU = 1.6`, `WZROST_CZASU = 1.5`.

Koszt rośnie wykładniczo, produkcja liniowo, i to jest celowe. Wytyczne stawiają tezę, że
ekspansja na inne biomy i konflikt o nie mają być rdzeniem rozgrywki, a nie opcją. Malejąca
opłacalność kolejnych poziomów wypycha gracza na mapę zamiast pionowo w górę.

Wartości bazowe, czyli koszt i czas pierwszego poziomu, wszystkie **robocze**:

| Budynek | wood | stone | food | iron | sulfur | czas |
|---|---|---|---|---|---|---|
| `SAWMILL`, `QUARRY`, `FARM` | 60 | 40 | 0 | 0 | 0 | 5 min |
| `IRON_MINE`, `SULFUR_PIT` | 80 | 60 | 0 | 0 | 0 | 8 min |
| `WAREHOUSE` | 120 | 100 | 0 | 0 | 0 | 12 min |
| `TOWN_HALL` | 200 | 180 | 0 | 20 | 0 | 30 min |
| `BARRACKS` | 180 | 140 | 0 | 40 | 0 | 25 min |
| `SHIPYARD` | 260 | 120 | 0 | 60 | 0 | 35 min |

Budynki wydobywcze są tanie i szybkie, bo gracz stawia je natychmiast; koszary i stocznia
najdroższe, bo odblokowują wojsko. Żaden budynek nie kosztuje jedzenia — jedzenie jest
walutą wojska, nie budowy, co daje farmie sens także dla gracza nierozbudowującego armii.

**Bez skracania czasu budowy przez ratusz.** Świadome pominięcie klasycznego mechanizmu:
ratusz ma już rolę, bo wyznacza limit populacji, a sprzężenie czasu z jego poziomem dokłada
zależność do tłumaczenia graczowi i do testowania przy każdej zmianie balansu.

**Bez górnego limitu poziomu.** Przy tych współczynnikach koszt sam staje się nieosiągalny,
a `numeric(14,4)` ma zapas do rzędu dziesięciu miliardów.

### 4.2 Rekrutacja

Koszt i czas liniowe od liczby sztuk, bez rabatu ilościowego.

| Typ | Budynek | Miejsca | Uwagi |
|---|---|---|---|
| `SETTLER` | `TOWN_HALL` | 5 | zużywany przy kolonizacji (spec C) |
| `MILITIA` | `BARRACKS` | 1 | podstawowa jednostka lądowa |
| `SLOOP` | `SHIPYARD` | 3 | 8 komórek na godzinę |
| `GALLEON` | `SHIPYARD` | 8 | 4 komórki na godzinę |

Rekrutacja wymaga budynku na poziomie co najmniej pierwszym. Partia trafia do garnizonu
w całości w chwili ukończenia, nie po sztuce — dostawa po sztuce wymagałaby częściowego
rozstrzygania zlecenia, a reguła anulowania i tak nie pozwala przerwać zlecenia rozpoczętego.

Limit populacji sprawdzany przy zakolejkowaniu, wobec sumy: garnizon plus jednostki we
własnych flotach plus wszystko, co czeka w kolejce rekrutacji tej osady. Bez ostatniego
składnika gracz zakolejkowałby dziesięć partii i przekroczył limit.

## 5. Materializacja i wydawanie zasobów

Spec A ustalił, że odczyt nigdy nie zapisuje. Spec B dokłada drugą połowę reguły:
**każdy wydatek materializuje**. Zamówienie rozbudowy, zamówienie rekrutacji, zwrot po
anulowaniu i ukończenie zlecenia zapisują stan zasobów na moment operacji i przestemplowują
znacznik synchronizacji.

Przebieg, zawsze w jednej transakcji: zablokuj wiersz osady, policz bieżące zasoby tą samą
formułą co klient, zapisz je i przestempluj znacznik, dopiero potem sprawdź wystarczalność
i odejmij koszt.

**Materializacja jest niewrażliwa na częstotliwość.** Obcięcie do pojemności jest
monotoniczne, a produkcja nigdy nie jest ujemna, więc materializacja dwa razy po godzinie
daje ten sam wynik co raz po dwóch godzinach. Gdyby tak nie było, częstotliwość odpytywania
wpływałaby na stan posiadania gracza.

**Kolejność, która ma znaczenie.** Ukończenie rozbudowy budynku wydobywczego zmienia stawkę
produkcji. Rozstrzygnięcie **musi zmaterializować zasoby starą stawką, zanim podniesie
poziom**. Odwrotna kolejność nalicza całą przeszłość od ostatniej synchronizacji nową,
wyższą stawką i po cichu daruje graczowi zasoby, których nie wyprodukował. Błąd nie rzuca
wyjątku i nie psuje testu jednostkowego — objawia się wyłącznie nadmiarem surowców, więc ma
własny test integracyjny (sekcja 9).

**Blokowanie.** Spec B blokuje dokładnie jedną osadę na transakcję, więc zakleszczenie jest
niemożliwe z konstrukcji. Reguła ustalonej kolejności współrzędnych, której wytyczne żądają
od rozstrzygania flot, jest tutaj zbędna i celowo nie wchodzi.

**Niewystarczające zasoby** kończą się kodem 409 z informacją, których surowców i ile brakuje.
Klient ma sekcję kosztów przyjmującą koszt i stan magazynu, więc przycisk wyszarza sam;
odpowiedź serwera jest zabezpieczeniem przed klientem, któremu nie wolno ufać.

**Czyste funkcje w warstwie domenowej**: sprawdzenie wystarczalności i odejmowanie kosztu,
obok istniejącego leniwego naliczania. Bez bazy, bez Nesta.

## 6. Rozstrzyganie zleceń

**Zadanie w kolejce niesie wyłącznie identyfikator zlecenia.** Cała prawda jest w bazie, więc
zadanie może zostać zgubione, powtórzone albo wykonane z opóźnieniem, nie zmieniając wyniku.

Rozstrzygnięcie w jednej transakcji: zablokuj wiersz osady, wczytaj zlecenie ponownie,
przerwij jeśli ma `resolved_at`, zmaterializuj zasoby **na moment `finish_at`**, zastosuj
skutek, ustaw `resolved_at`, wystartuj następne zlecenie kolejki i zaplanuj jego zadanie.

**Materializacja na moment ukończenia, nie na teraz.** Gdy worker obudzi się dziesięć minut
po terminie, a osada nie była w międzyczasie odpytywana, materializacja na „teraz" naliczyłaby
te dziesięć minut starą stawką, choć budynek był już gotowy. Wytyczne żądają tego samego od
rozstrzygania flot.

**Następne zlecenie startuje od `finish_at` poprzednika, nie od teraz.** Inaczej każde
opóźnienie workera przesuwałoby całą kolejkę i po nocnym przestoju gracz straciłby godziny.
Gdy poprzednik skończył się dawno, następne dostaje termin w przeszłości i rozstrzyga się
natychmiast — to jest poprawne, a nie awaryjne.

**Kolejność rozstrzygania ma znaczenie dla arytmetyki.** Rozbudowa tartaku ukończona
w poniedziałek zmienia stawkę, którą liczy się zasoby dla rekrutacji ukończonej we wtorek.
Przemiatanie po restarcie idzie po `finish_at` rosnąco, nie po identyfikatorze.

**Przemiatanie przy starcie** robi dwie rzeczy: rozstrzyga po kolei wszystko z terminem
w przeszłości i pustym `resolved_at`, a potem planuje na nowo zadania dla zleceń rozpoczętych
z terminem w przyszłości — Redis mógł zostać wyczyszczony, baza nie.

**Anulowanie.** Usunięcie zlecenia nierozpoczętego materializuje zasoby, dopisuje zwrot
obcięty do pojemności magazynu (nadwyżka przepada, zgodnie ze słownikiem) i przesuwa pozycje
dalszych zleceń o jeden w dół, w tej samej transakcji. Zlecenie rozpoczęte odpowiada 409.

**Poziom docelowy liczy się przy zakolejkowaniu**, jako bieżący poziom budynku powiększony
o liczbę nierozstrzygniętych zleceń dla tego samego budynku. Dzięki temu dwie rozbudowy
tartaku zakolejkowane pod rząd celują w poziom drugi i trzeci, a nie dwa razy w drugi, a koszt
drugiej z nich jest liczony dla poziomu trzeciego. Pole `buildingUpgrades` w widoku osady
pokazuje ten sam, następny poziom, więc klient i serwer zawsze mówią o tym samym.

**Limit długości kolejki** na osadę i rodzaj, wartość robocza pięć. Bez niego gracz
z nadmiarem surowców zamieni kolejkę w magazyn.

**Worker** startuje w tym samym procesie co aplikacja, wyłączany zmienną środowiskową, żeby
dało się później wydzielić osobną instancję bez zmian w kodzie.

## 7. Powierzchnia API

Wszystkie trasy za `ProfileGuard` i `WorldWritableGuard`.

```
POST   /worlds/:id/settlements/:x/:y/buildings/:type/upgrade
POST   /worlds/:id/settlements/:x/:y/recruit          { type, count }
DELETE /worlds/:id/settlements/:x/:y/orders/:orderId
```

Wszystkie trzy zwracają **pełny widok osady po operacji**, nie potwierdzenie. Klient dostaje
jednym żądaniem nowy stan zasobów, nową kolejkę i nowy garnizon, zamiast odpytywać ponownie
i migotać interfejsem.

**Widok własnej osady rośnie o trzy pola:**

- `garrison` — słownik czterech typów wojska.
- `orders` — tablica zleceń: identyfikator, rodzaj, pozycja, `startedAt`, `finishAt`, ładunek.
- `buildingUpgrades` — słownik dla sześciu slotów: poziom docelowy, koszt w pięciu zasobach,
  czas w sekundach.

Ostatnie pole jest tam z konkretnego powodu: `BuildingSheet.refresh_costs(costs, stock)`
u klienta potrzebuje kosztu następnego poziomu. Gdyby serwer go nie podawał, klient musiałby
albo liczyć formuły sam, czego wytyczne mu zabraniają, albo strzelać osobnym żądaniem przy
każdym otwarciu arkusza.

**Widok cudzej osady nie zmienia się o ani jedno pole.** Reguły informacyjne ze specu A
obowiązują bez wyjątku: garnizon, kolejka i koszty są prywatne dla właściciela.

## 8. Praca wynikająca z tego specu po stronie klienta

Bez tej listy spec jest w połowie martwy.

1. Odsłonić w `BuildingSheet` sekcję kosztów i sekcję czasu, podpiąć `refresh_costs`
   i `refresh_timer` pod nowe pola. Węzły i metody już istnieją, ukryte z adnotacją
   „kontrakt API ich nie ma, scena gotowa na przyszłość".
2. **Dorobić widok kolejki.** Arkusz ma jeden pasek postępu, a kolejka jest wieloelementowa.
   Największa pozycja na tej liście i bezpośrednia konsekwencja wyboru kolejki.
3. Dorobić interfejs rekrutacji — dziś nie istnieje.
4. Dorobić prezentację garnizonu.
5. Podpiąć trzy nowe trasy w `HttpProvider` i odwzorować je w `MockProvider`, żeby klient
   dało się rozwijać bez serwera.

## 9. Testy

**Rozdzielenie wynikające z testowalności.** Rozstrzyganie zlecenia jest serwisem
przyjmującym identyfikator i zegar; worker BullMQ to cienka przejściówka. Testy integracyjne
uderzają w serwis ze sterowanym zegarem i nie czekają na prawdziwe opóźnienia; jeden test
e2e dowodzi, że przejściówka jest podpięta. Bez tego podziału każdy test kolejki trwałby
tyle, ile trwa budowa.

**Harness e2e dostaje drugi kontener.** BullMQ wymaga prawdziwego Redisa, więc `global-setup`
stawia go obok Postgresa przez Testcontainers, na losowym porcie, a adres trafia do aplikacji
testowej tą samą drogą co adres bazy.

**Jednostkowe, bez bazy:** formuły kosztu i czasu na poziomach 1, 2 i 10 z zaokrągleniem;
sprawdzenie wystarczalności i odejmowanie; zliczanie populacji z garnizonu, flot i kolejki;
arytmetyka pozycji po anulowaniu.

**Integracyjne, na bazie, bez HTTP — tu leży ciężar tego specu:**

- **Rozbudowa ukończona w przeszłości nalicza starą stawką do momentu ukończenia i nową po
  nim.** Oczekiwana wartość liczona w teście ręcznie, nie tą samą funkcją, którą testujemy.
- Powtórzone zadanie nie zmienia niczego.
- Przemiatanie po restarcie rozstrzyga dwa zaległe zlecenia w kolejności terminów, przy czym
  pierwsze zmienia stawkę produkcji drugiego; odwrotna kolejność daje inny wynik i test to
  wyłapuje.
- Następne zlecenie startuje od terminu poprzednika, nie od chwili obudzenia workera.
- Dwa równoległe zamówienia na tę samą osadę serializują się.

**End to end przez HTTP:** rozbudowa zwraca pełny widok z nową kolejką; brak zasobów daje 409
z niedoborem; anulowanie nierozpoczętego zwraca koszt, rozpoczętego odmawia; przekroczenie
limitu kolejki odmawia; limit populacji liczy także zlecenia czekające; świat `ENDED` odmawia
zapisu; cudza osada jest nietykalna.

**Standard dowodu.** Projekt wyrobił w specu A zwyczaj weryfikacji mutacyjnej dla testów
nośnych i ten spec go utrzymuje: test naliczania odcinkowego, test kolejności przemiatania
i test idempotencji mają zostać sprawdzone przez celowe zepsucie kodu i potwierdzenie porażki.

## 10. Kolejność prac

1. Migracje: dwa enumy, `settlement_orders`, `garrisons`, usunięcie `settlements.population`.
2. Balans: formuły kosztu, czasu, miejsc w populacji; czyste funkcje wydawania zasobów.
3. Materializacja przy wydatkach, z blokadą wiersza.
4. Serwis rozstrzygania zleceń, ze sterowanym zegarem, bez kolejki zadań.
5. Kolejka BullMQ i worker jako przejściówka; przemiatanie przy starcie.
6. Trasy: rozbudowa, rekrutacja, anulowanie; rozszerzony widok osady.
7. Testy e2e reguł informacyjnych dla nowych pól i świata zakończonego.
