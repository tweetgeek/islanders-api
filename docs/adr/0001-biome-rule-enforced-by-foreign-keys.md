---
status: accepted
---
# Reguła „budynek zgodny z biomem” egzekwowana kluczami obcymi, biom osady przechowywany

ADR 0002 klienta zabrania budynku wydobywczego zasobu spoza biomu osady, a wytyczne API
(sekcja 6) wymagają, żeby baza egzekwowała tę regułę sama, nie tylko aplikacja. Biom wyspy
jest funkcją `(seed, x, y)` i zgodnie z zasadą „w bazie tylko to, czego nie da się wyliczyć”
nie powinien mieć kolumny; bez niego jednak Postgres nie ma jak sprawdzić reguły.

Decyzja: `settlements` ma kolumnę `biome`, wpisywaną raz przy założeniu osady i nigdy
nie zmienianą, a `buildings` powtarza `biome` i ma dwa klucze obce:
`(world_id, x, y, biome) → settlements(world_id, x, y, biome)` gwarantuje, że biom
w wierszu budynku to biom osady, a `(biome, type) → biome_buildings(biome, type)`
gwarantuje, że typ budynku jest dozwolony w tym biomie. Tabela `biome_buildings` ma 18
wierszy wstawianych migracją: 4 budynki wspólne × 3 biomy plus 2 wydobywcze na biom.

Odstępstwo od zasady „nie przechowujemy wyliczalnego” jest bezpieczne, bo biom wyspy jest
niezmienny w obrębie rundy (zmiana geografii to migracja świata, ADR 0001 klienta), więc
nie ma stanu, z którym kolumna mogłaby się rozjechać.

## Odrzucone alternatywy

- Trigger `BEFORE INSERT/UPDATE` liczący biom albo sprawdzający tabelę dozwolonych:
  logika w PL/pgSQL poza zasięgiem testów jednostkowych i poza Drizzle, trudniejsza
  w utrzymaniu niż dwa klucze obce.
- Walidacja wyłącznie w aplikacji: każdy zapis omijający serwis (skrypt, naprawa ręczna,
  przyszły moduł) mógłby złamać regułę bez ostrzeżenia.
- `CHECK` na `buildings.type` bez biomu: nie potrafi wyrazić zależności od osady.

## Adnotacja 2026-09-13

Po ADR 0004 biom wyspy nie jest już wyliczany z seeda, tylko zapisany w tabeli `islands` przy
generacji świata. Decyzja o kluczach obcych obowiązuje bez zmian; `settlements.biome` jest
kopią biomu z wiersza `islands`, a po ADR 0006 klucze tracą kolumnę `world_id`.
