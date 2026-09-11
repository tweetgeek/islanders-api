---
status: accepted
---
# Zdarzenia w czasie na kolejce zadań, mimo że zasoby liczymy leniwie

Wytyczne projektu mówią, że zasoby osady liczy się leniwie przy odczycie, nigdy tickiem, i ta
zasada jest w kodzie od specu A. Zlecenia rozbudowy i rekrutacji (spec B) łamią ją pozornie:
ukończenie zlecenia jest zdarzeniem w czasie, obsługiwanym przez worker BullMQ obudzony na
moment `finish_at`, a nie policzonym przy najbliższym odczycie.

Decyzja: zasada „nigdy tickiem" dotyczy **naliczania wielkości ciągłych**, a zdarzenie
w czasie to inna klasa problemu i wolno je obsłużyć zadaniem. Baza pozostaje źródłem prawdy —
zadanie niesie wyłącznie identyfikator zlecenia, a każde rozstrzygnięcie sprawdza `resolved_at`
wewnątrz transakcji, więc zadanie zgubione, powtórzone albo spóźnione nie zmienia wyniku.
Przemiatanie zaległości przy starcie i co minutę zamyka lukę, gdy zadanie przepadnie.

## Odrzucone alternatywy

- **Leniwe rozstrzyganie przy odczycie**, bez Redisa. Wymagałoby odcinkowego naliczania zasobów
  przy każdym odczycie (stara stawka do momentu ukończenia rozbudowy, nowa po nim), a przede
  wszystkim sprawiało, że osada nieodpytywana przez tydzień nie istnieje dla świata. Przy ataku
  w specu C byłoby to nie do utrzymania: obrońca offline miałby garnizon w stanie sprzed tygodnia.
- **Odłożenie kolejki do specu C**, razem z flotami. Rekrutacja i rozbudowa potrzebują jej
  wcześniej, a budowanie tej samej infrastruktury dwa razy jest droższe niż raz.

## Konsekwencje

- Redis i BullMQ wchodzą w specu B, nie C. Spec C dziedziczy gotowy mechanizm dla flot.
- Idempotencja i odporność na przestój muszą być poprawne od tego specu, bo spec C je odziedziczy.
