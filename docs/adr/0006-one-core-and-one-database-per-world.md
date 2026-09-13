---
status: accepted
---
# Jedna instancja core i jedna baza na świat

Dotąd jeden proces obsługiwał wszystkie światy, a każda tabela gry miała `world_id`.

Decyzja: każdy świat to osobne wdrożenie aplikacji `core` z własnym Postgresem (co najmniej
osobną bazą na wspólnym serwerze) i własnym Redisem (co najmniej osobnym numerem bazy i
prefiksem kolejek), pod własną subdomeną. Core nie wie o istnieniu innych światów; listę
światów zna tylko rejestr w auth. Świat testowy jest takim samym, osobnym core.

Powody:

- **Izolacja awarii i obciążenia.** Popularny świat, zła migracja albo zablokowana kolejka
  dotyka tylko jednego świata.
- **Niezależne wersje.** Świat testowy może chodzić na nowszym kodzie niż produkcyjny.
- **Odtwarzalność.** Świat to jedna baza: dump, eksport i import obejmują dokładnie jeden świat.
- **Prostszy schemat.** Znika `world_id` z kluczy, zapytań i kluczy obcych.

## Konsekwencje

- Tworzenie świata to operacja wdrożeniowa (baza, sekrety, subdomena), wykonywana przez
  technika CLI `world:init/generate/open`, nie endpoint.
- Migracje trzeba uruchamiać na każdej bazie świata; wdrożenie nowej wersji to przejście
  po wszystkich światach.
- Zapytania przekrojowe przez wszystkie światy (statystyki globalne) wymagają zbierania danych
  z wielu API admina albo osobnej hurtowni.
- Jeden świat na wielu serwerach aplikacyjnych działa od razu (repliki bezstanowe);
  podział jednej mapy na wiele baz nie jest celem.

## Odrzucone alternatywy

- **Jeden core, wiele światów w jednej bazie (stan dotychczasowy).** Wspólny los wszystkich
  światów przy awarii i migracji.
- **Jeden core, schemat Postgresa na świat.** Izolacja danych bez izolacji procesu i wersji kodu.
