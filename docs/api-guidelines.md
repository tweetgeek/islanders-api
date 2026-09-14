# Islanders API — wytyczne projektowe

Data: 2026-09-08, przepisane 2026-09-13 pod podział na auth, core świata i tools
Status: obowiązujące. Budowa systemu: `docs/architecture.md`. Mapa przejścia:
`docs/superpowers/specs/2026-09-13-architecture-split-design.md`.

## 1. Cel i zakres

Backend gry „Islanders”: mobilnego MMO RTS w scenerii archipelagu. Klient (Godot 4.8,
GDScript) leży w `../islanders`. Ten dokument opisuje, czego serwer pilnuje, jak wygląda
kontrakt z klientem i jakie zasady obowiązują każdą usługę.

Zakres pierwszej wersji: konta ponad światami, generowane i zapisane światy, pogoda, osady
z leniwie liczonymi zasobami, budynki i kolejki zleceń, floty z rozstrzyganiem w chwili
przybycia, kolonizacja i wyprawy, niepubliczny panel admina.

Poza zakresem pierwszej wersji: walka rozstrzygana szczegółowo (na razie wynik binarny),
sojusze, handel między graczami, ranking, czat, powiadomienia push, natychmiastowe
unieważnianie tokenów, jeden świat podzielony na wiele baz.

## 2. Zasada nadrzędna i źródła wiedzy

**Serwer jest jedynym źródłem prawdy.** Klient pokazuje stan, który dostał, i może go
ekstrapolować w czasie (licznik zasobów, pasek postępu), ale niczego nie rozstrzyga i nie
wylicza stanu świata sam — także geografii (ADR 0004).

| Plik | Co z niego wynika |
|---|---|
| `../islanders/CONTEXT.md` | Słownik domeny. Nazwy w API mają być z nim zgodne |
| `../islanders/docs/adr/0002-biome-exclusive-resources.md` | Każdy biom produkuje dokładnie dwa zasoby i dopuszcza dokładnie dwa budynki wydobywcze |
| `../islanders/docs/superpowers/specs/2026-09-07-islanders-client-skeleton-design.md` | Kształt JSON-a, który klient parsuje |
| `../islanders/scripts/core/Settlement.gd` | Referencyjna implementacja leniwej ewaluacji zasobów po stronie klienta |
| `docs/adr/` | Decyzje backendu |

ADR 0001 klienta (geografia deterministyczna) jest zastąpiony przez ADR 0004 API.

Gdy klient i te wytyczne różnią się w **kształcie danych**, zmiana idzie świadomie po obu
stronach — nie obchodzimy rozjazdu po cichu w backendzie. Gdy różnią się w **regułach gry**,
wygrywa serwer.

## 3. Decyzje architektoniczne

| Obszar | Decyzja | Gdzie |
|---|---|---|
| Podział usług | auth (konta), core (jeden świat), tools (panel) | `architecture.md` §2, ADR 0006 |
| Geografia | Generowana raz, zapisana w bazie świata | ADR 0004 |
| Tożsamość | JWT EdDSA z auth, weryfikowany lokalnie w core | ADR 0005 |
| Komunikacja między usługami | HTTP wewnętrzne z outboxem | ADR 0007 |
| Dostęp do danych | Drizzle ORM na PostgreSQL, osobna baza na usługę i świat | ADR 0006 |
| Czas serwera | Zdarzenia w czasie na kolejce BullMQ, baza źródłem prawdy | ADR 0002, 0003 |
| Zasoby | Liczone leniwie przy odczycie, nigdy tickiem | §5 |
| Pogoda | Jedna na świat, co godzinę, z historią | `architecture.md` §5.3 |

## 4. Reguły domenowe, których core jest strażnikiem

Klient je zna i respektuje, ale klientowi nie wolno ufać. Core waliduje każdą z nich:

1. **Osada tylko na lądzie.** Osada ma klucz obcy do wiersza `islands`; współrzędne bez wyspy
   są odrzucane.
2. **Budynek zgodny z biomem.** Osada nie może mieć budynku wydobywczego dla zasobu spoza
   swojego biomu (ADR 0002 klienta, ADR 0001 API). Dotyczy to również `productionPerHour`:
   serwer nie wysyła niezerowej produkcji zasobu, którego biom nie produkuje.
3. **Sześć slotów.** Cztery wspólne budynki plus dwa wydobywcze wynikające z biomu.
4. **Pojemność magazynu.** Zasoby obcinane z góry do `capacity` osobno dla każdego zasobu,
   z dołu do zera. Nadwyżka przepada — przy produkcji, rozładunku i zwrocie za zlecenie.
5. **Populacja to limit, nie zasób.** Nie rośnie w czasie, nie konsumuje jedzenia, ogranicza
   rekrutację.
6. **Kolonizacja wymaga osadnika** we flocie z misją `COLONIZE`; osadnik jest zużywany.
   Gdy wyspa okazała się zajęta w chwili przybycia, flota wraca.
7. **Znalezisko istnieje tylko na wyspie bez osady** i zawiera wyłącznie zasoby spoza biomu
   tej wyspy. Jego zawartość jest zapisana przy generacji świata i zmniejszana przez wyprawy.
8. **Flota jest jednokierunkowa.** Powrót to nowa flota, tworzona przez serwer.
9. **Prędkość floty to prędkość najwolniejszego statku**, a wiatr z pogody obowiązującej
   w chwili wypłynięcia wpływa na czas podróży wyłącznie wtedy. Wypłynięta flota ma zamrożony
   czas przybycia.
10. **Świat `ENDED` jest tylko do odczytu**, świat `CLOSED` nie przyjmuje nowych profili,
    świat `DRAFT` nie przyjmuje żadnego ruchu graczy.

## 5. Czas, zasoby i autorytet serwera

Zasoby liczone są **leniwie przy odczycie**, tą samą formułą co u klienta:

```
current = clamp(stored + production_per_hour * (now - last_sync_at) / 3600, 0, capacity)
```

Serwer materializuje wynik i przestempluje `last_sync_at` tylko wtedy, gdy coś faktycznie
wydaje albo dolicza zasoby. Zwykły odczyt niczego nie zapisuje.

Zdarzenia w czasie (ukończenie zlecenia, przybycie floty, zmiana pogody) obsługuje kolejka
zadań, ale źródłem prawdy pozostaje baza: zadanie niesie tylko identyfikator, rozstrzygnięcie
jest idempotentne i sprawdzane wewnątrz transakcji, a zaległości przemiata start aplikacji
i cykl co minutę (ADR 0002).

W odpowiedzi API zwraca **stan wraz ze znacznikiem czasu**. Klient ekstrapoluje między
odpytaniami; odbieranie mu `lastSyncAt` zepsułoby płynny licznik w HUD.

Każda odpowiedź niesie `serverTime` w ISO 8601 UTC (pole i nagłówek `X-Server-Time`). Klient
kalibruje po nim swój zegar. Wszystkie znaczniki czasu w API są ISO 8601 UTC ze strefą `Z`.

## 6. Rozstrzyganie flot

Przybycie floty to zadanie na moment `arrive_at`. Rozstrzygnięcie:

1. Zablokuj wiersze osad w jednej transakcji, w ustalonej kolejności współrzędnych.
2. Zmaterializuj zasoby celu na moment przybycia, nie na „teraz”.
3. Rozstrzygnij misję: `TRANSPORT` rozładowuje, `EXPEDITION` zabiera część znaleziska,
   `COLONIZE` zakłada osadę albo zawraca, `ATTACK` rozstrzyga starcie, `RETURN` rozładowuje
   w osadzie macierzystej.
4. Jeśli coś ma wrócić, utwórz flotę `RETURN` i zaplanuj jej zadanie.
5. Ustaw `resolved_at` i zatwierdź transakcję.

Wymagania: idempotencja przez `resolved_at`; po przestoju rozstrzyganie zaległych flot
w kolejności `arrive_at`; czas przybycia liczy wyłącznie serwer.

## 7. Reguły informacyjne

**Reguły informacyjne są częścią kontraktu.** Serwer nie wysyła danych, których gracz nie
powinien widzieć.

| Dane | Kto widzi |
|---|---|
| Geografia, biom, znalezisko, pogoda | każdy profil na świecie |
| Nazwa osady i pseudonim właściciela | każdy profil na świecie |
| Zasoby, budynki, populacja, magazyn, kolejki zleceń | wyłącznie właściciel |
| Garnizon | wyłącznie właściciel |
| Flota w drodze | właściciel, oraz właściciel celu gdy to atak na jego osadę |
| E-mail konta | nikt poza auth i panelem admina |

Cudza osada wraca do klienta **bez klucza `resources`** — klient rozpoznaje po jego obecności,
że osada jest jego własna. Nie wysyłaj `resources: {}` dla cudzej osady.

API admina core (port wewnętrzny) nie podlega regułom informacyjnym gracza, ale nigdy nie jest
osiągalne z internetu.

## 8. Powierzchnia API

Klucze w `camelCase`, współrzędne jako `{"x": int, "y": int}`, identyfikatory kont jako uuid,
znaczniki czasu ISO 8601 UTC. Wersja w ścieżce (`/v1`).

### 8.1 auth — `https://users.islanders.online`

```
POST   /v1/auth/register              rejestracja konta
POST   /v1/auth/login                 logowanie, access + refresh
POST   /v1/auth/refresh               rotacja refresh tokenu
POST   /v1/auth/logout                unieważnienie refresh tokenu
GET    /v1/worlds                     rejestr światów widocznych dla konta, z flagą joined
GET    /.well-known/jwks.json         klucze publiczne
```

Wewnętrzne (`/internal/v1`, tylko sieć wewnętrzna, token serwisowy) — `architecture.md` §7.

### 8.2 core — `https://world-<n>.islanders.online`

Wszystkie trasy wymagają tokenu `aud: islanders-worlds`.

```
GET    /v1/world                      ustawienia publiczne, status, pogoda bieżąca i następna, profil
POST   /v1/join                       dołączenie, tworzy profil i osadę domową
GET    /v1/map/islands?bbox=          wyspy w prostokącie: biom, promień, shapeSeed, znalezisko
GET    /v1/settlements                własne osady w pełni
GET    /v1/settlements?bbox=          osady w prostokącie, dane publiczne
GET    /v1/fleets                     floty własne oraz nadchodzące ataki na własne osady

POST   /v1/settlements/:x/:y/buildings/:type/upgrade
POST   /v1/settlements/:x/:y/recruit
DELETE /v1/settlements/:x/:y/orders/:orderId
POST   /v1/fleets                     wysłanie floty
DELETE /v1/fleets/:fleetId            zawrócenie floty
```

Endpointy po prostokącie mają górny limit pola, bo klient ładuje świat fragmentami. Dane wysp
są po otwarciu świata niezmienne poza znaleziskami, więc odpowiedź mapy niesie `ETag`.

Wewnętrzne (`:3001`): `/admin/v1/*`, `/health/live`, `/health/ready`.

### 8.3 Błędy

Jednolity kształt błędu we wszystkich usługach, opisany w `packages/contracts`. `401` — brak
lub nieważny token; `403` — token ważny, ale brak roli lub profilu; `404` — zasób nie istnieje
albo jest niewidoczny dla gracza; `409` — reguła gry lub stan świata; `429` — limit zapytań;
`503` — zależność usługi niedostępna.

## 9. Limity i bezpieczeństwo

- Limity zapytań w Redisie, wspólne dla wszystkich replik usługi: po adresie na trasach auth,
  po koncie na trasach gry.
- `trust proxy` ustawiane z konfiguracji zgodnie z topologią wdrożenia.
- Hasła argon2id. Refresh tokeny w bazie wyłącznie jako skrót.
- Parametry zapytań SQL nie trafiają do logów.
- Panel admina i porty wewnętrzne nigdy nie są wystawiane publicznie.

## 10. Testy

Twierdzenie bez wyjścia komendy nie jest dowodem.

- **Jednostkowe** czystej logiki: generator, pogoda, leniwe zasoby, formuły balansu, czas
  podróży, reguły biomów, widoki z regułami informacyjnymi. Bez bazy i sieci.
- **Integracyjne** na bazie: rozstrzyganie zleceń i flot (dwa zdarzenia w tej samej sekundzie,
  restart, powtórzone zadanie), tick pogody przy wielu replikach, outbox.
- **E2E** przez HTTP na prawdziwej bazie w kontenerze, per aplikacja, w tym dowód, że
  w odpowiedzi o cudzą osadę nie ma pola `resources`.
- **Kontraktowe** auth ↔ core na schematach z `packages/contracts`.
- **Awarii**: core przy niedostępnym auth.
- Testy nośne (idempotencja, kolejność przemiatania, naliczanie odcinkowe) sprawdzane mutacyjnie.

## 11. Kolejność prac

Roadmapa etapów: `docs/superpowers/specs/2026-09-13-architecture-split-design.md`, sekcja 4.
