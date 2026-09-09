import { customType } from 'drizzle-orm/pg-core';

/** Tekst porównywany bez rozróżniania wielkości liter; wymaga `CREATE EXTENSION citext` (migracja 0000). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});
