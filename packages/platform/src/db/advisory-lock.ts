import type { Sql } from 'postgres';

/**
 * Praca „jedna na usługę” przy wielu replikach. Blokada sesyjna musi być zdjęta na tym samym
 * połączeniu, na którym ją wzięto, więc rezerwujemy połączenie z puli na czas pracy.
 * Replika, która nie dostanie blokady, pomija cykl — nie czeka.
 */
export async function withAdvisoryLock<T>(
  sql: Sql,
  key: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const conn = await sql.reserve();
  try {
    const [{ locked }] = await conn<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${key}) AS locked`;
    if (!locked) return { acquired: false };
    try {
      return { acquired: true, value: await fn() };
    } finally {
      await conn`SELECT pg_advisory_unlock(${key})`;
    }
  } finally {
    conn.release();
  }
}
