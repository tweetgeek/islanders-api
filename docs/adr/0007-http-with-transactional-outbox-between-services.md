---
status: accepted
---
# HTTP po sieci wewnętrznej z outboxem w bazie zamiast brokera wiadomości

Core musi informować auth o stanie świata i o graczach dołączających do świata, a auth bywa
niedostępny. Zmiana w świecie nie może się cofnąć ani zablokować z tego powodu.

Decyzja: zdarzenie dla innej usługi zapisuje się w tabeli `outbox` bazy core w tej samej
transakcji co zmiana. Wysyłacz działający pod blokadą doradczą (jedna replika naraz) wysyła
partie po HTTP na wewnętrzny adres auth, z backoffem i jitterem. Auth przyjmuje zdarzenia
idempotentnie po `eventId`. Usługi uwierzytelniają się tokenem serwisowym wydanym przez auth
(client credentials). Ruch między usługami nigdy nie idzie przez publiczne domeny.

Powody:

- **Gwarancja „co najmniej raz” bez nowej infrastruktury.** Postgres i Redis już są.
- **Awaria odbiorcy nie dotyka nadawcy.** Zdarzenia czekają w bazie świata.
- **Wymienialność.** Kontrakt zdarzeń leży w `packages/contracts`; przepięcie wysyłacza na
  broker nie zmienia miejsc, które zdarzenia tworzą.

## Konsekwencje

- Auth widzi stan światów z opóźnieniem (sekundy w normalnej pracy, dłużej po awarii).
- Tabela `outbox` wymaga sprzątania wysłanych wierszy.
- Każdy klient HTTP ma timeout, ponawia tylko operacje idempotentne, a klient auth ma
  circuit breaker.

## Odrzucone alternatywy

- **Broker (NATS, RabbitMQ, wspólny Redis Streams).** Kolejny element do utrzymania i kolejny
  punkt awarii już na MVP.
- **Zaufanie wyłącznie do sieci, bez tokenów serwisowych.** Każdy, kto dostanie się do sieci,
  może podszyć się pod świat.
- **Bezpośrednie wywołanie auth w trakcie operacji gracza.** Awaria auth zatrzymałaby
  dołączanie do świata.
