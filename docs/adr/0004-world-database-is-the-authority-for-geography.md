---
status: accepted
supersedes: ADR 0001 klienta (`../islanders/docs/adr/0001-deterministic-world-geography.md`) w części dotyczącej źródła geografii
---
# Baza świata jest autorytetem geografii; klient nie liczy mapy z seeda

Dotąd geografia była funkcją `(world_seed, x, y)` liczoną identycznie przez klienta (GDScript)
i serwer (TypeScript), a zgodność pilnował test na 80 000 komórkach. W bazie trzymaliśmy tylko
to, czego nie da się wyliczyć.

Decyzja: generator uruchamiany raz przy tworzeniu świata zapisuje wyspy, biomy, promienie,
znaleziska i pulę wysp startowych w bazie świata. Klient pobiera je z API po prostokącie mapy
i niczego z seeda nie wylicza. Seed i parametry generatora są zapisane w `world_settings`
tylko informacyjnie.

Powody:

- **API ma być jedynym źródłem prawdy.** Wspólny algorytm oznaczał dwa źródła prawdy, które
  musiały się zgadzać do ostatniego bitu.
- **Generator ma być swobodny.** Rozmieszczanie wysp startowych pod graczy, proporcje biomów,
  ręczne poprawki mapy przed otwarciem świata i zmiana algorytmu między światami były
  niemożliwe, dopóki każdy krok musiał mieć bliźniaczą implementację w kliencie.
- **Odtwarzalność bez algorytmu.** Świat odtwarza się lokalnie z eksportu bazy 1:1, także gdy
  kod generatora zmienił się od czasu jego utworzenia.

## Konsekwencje

- Znika wymóg zgodności bit w bit, test `world-parity.spec.ts`, plik
  `contract/world-parity.json` i zmienna `ISLANDERS_CLIENT_DIR`.
- `deposits_taken` (odchylenie od stanu wyliczonego) zastępuje `deposits` (stan bieżący).
- Osada ma klucz obcy do `islands`, więc „osada tylko na lądzie” pilnuje baza, nie funkcja.
- ADR 0001 API (reguła biomu kluczami obcymi) obowiązuje dalej; biom osady pochodzi z wiersza
  `islands` zamiast z funkcji.
- Klient musi pobierać mapę fragmentami i ją cache'ować; wybrzeże pozostaje kosmetyką liczoną
  lokalnie z `shape_seed` wyspy i nie jest częścią kontraktu.
- Rozmiar bazy rośnie o jeden wiersz na wyspę — przy mapie 200 × 200 i gęstości lądu ok. 18 %
  to ok. 7 200 wierszy, bez znaczenia.

## Odrzucone alternatywy

- **Mapa w bazie jako kopia do debugowania, klient nadal liczy z seeda.** Zachowuje cały koszt
  zgodności i nie odblokowuje generatora.
- **Hybryda: teren z seeda, rozmieszczenie wysp startowych i znalezisk z bazy.** Dwa źródła
  prawdy dla jednej mapy i nadal ograniczony generator terenu.
