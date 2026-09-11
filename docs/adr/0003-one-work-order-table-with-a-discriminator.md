---
status: accepted
---
# Jedna tabela zleceń z rozróżnikiem rodzaju zamiast dwóch tabel

Osada ma dwie niezależne kolejki: budowy i szkolenia. Naturalnym odruchem są dwie tabele
z płaskimi, oczywistymi typami. Wybraliśmy jedną tabelę `settlement_orders` z kolumną `kind`
i dwoma zestawami kolumn ładunku, z których dokładnie jeden jest wypełniony, co wymusza
ograniczenie `CHECK`.

Powód nie jest estetyczny, tylko ilościowy: idempotencja rozstrzygania, przemiatanie zaległości,
przesuwanie pozycji po anulowaniu i planowanie zadań to cztery rzeczy trudne do napisania
poprawnie. Przy dwóch tabelach powstałyby dwa razy, a spec C dołożyłby trzeci komplet dla flot.
Jedno takie miejsce, pokryte testami integracyjnymi obejmującymi restart i powtórzone zadanie,
jest warte polimorficznego ładunku i unii rozróżnianej w typach TypeScriptu.

## Odrzucone alternatywy

- **Dwie tabele, dwie kolejki, dwa workery.** Czytelniejsze zapytania i płaskie typy, ale
  mechanizm odporności powielony.
- **Jedna tabela z ładunkiem w `jsonb`.** Usuwa duplikację kolumn, ale odbiera bazie możliwość
  egzekwowania reguły biomu kluczem obcym, a ADR 0001 wprost wymaga, żeby ta reguła była
  pilnowana przez bazę, nie przez aplikację.

## Konsekwencje

- `position` numeruje się w obrębie rodzaju, więc jedna tabela obsługuje dwie niezależne kolejki
  biegnące równolegle.
- Zlecenie rozbudowy niesie kolumnę `biome` i tę samą parę kluczy obcych co tabela `buildings`,
  żeby reguła z ADR 0001 obowiązywała także zamiary, nie tylko stan końcowy.
