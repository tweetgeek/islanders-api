---
status: accepted
---
# Osobna usługa kont; światy weryfikują token lokalnie kluczem publicznym

Gracz ma jedno konto na wszystkie światy, a każdy świat to osobna instancja API. Konta nie mogą
więc mieszkać w żadnym świecie.

Decyzja: usługa `auth` jest jedynym właścicielem kont, haseł, refresh tokenów i ról globalnych.
Wydaje krótkie (15 min) access tokeny podpisane EdDSA i publikuje klucze publiczne jako JWKS.
Core weryfikuje token lokalnie, bez wywołania auth, i sam decyduje o dostępie do świata na
podstawie ról z tokenu i własnych profili. Token nie zawiera listy światów.

Powody:

- **Awaria auth nie zatrzymuje gry.** Zalogowani gracze grają do wygaśnięcia tokenu; nie działa
  tylko logowanie i odświeżanie.
- **Brak skoku sieciowego na każdym żądaniu gry.**
- **Dołączenie do świata nie wymaga nowego tokenu**, a token nie rośnie z liczbą światów.

## Konsekwencje

- Ban globalny i wylogowanie ze wszystkich urządzeń działają z opóźnieniem do 15 minut.
- Rotacja kluczy: auth publikuje klucz nowy obok wycofywanego przez co najmniej czas życia
  access tokenu; core odświeża JWKS przy nieznanym `kid`.
- `accountId` staje się uuid (dotąd `players.id serial`) — zmiana w kontrakcie klienta
  (`ownerId`).
- Core przechowuje o koncie tylko `accountId` i kopię `nickname`; zmiana pseudonimu wymaga
  zdarzenia z auth do światów (poza MVP).

## Odrzucone alternatywy

- **Token nieprzezroczysty i introspekcja w auth przy każdym żądaniu.** Natychmiastowe
  odbieranie dostępu kosztem zatrzymania wszystkich światów przy awarii auth.
- **Lista światów w tokenie.** Wymusza odświeżenie tokenu po dołączeniu i przenosi decyzję
  o dostępie do auth, które nie zna stanu świata.
- **Kanał unieważnień od razu.** Właściwy następny krok, gdy opóźnienie bana zacznie boleć;
  nie jest potrzebny na MVP.
