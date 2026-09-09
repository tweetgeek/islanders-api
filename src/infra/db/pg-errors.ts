type PgError = { code?: string; constraint_name?: string };

/**
 * Drizzle 0.45 opakowuje błąd sterownika w `DrizzleQueryError` i zostawia oryginalny
 * `PostgresError` pod `cause`, więc kodu szukamy w całym łańcuchu przyczyn.
 */
function asPgError(err: unknown): PgError | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return null;
    }
    if ('code' in current) {
      return current as PgError;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** 23505 = naruszenie unikalności; opcjonalnie tylko dla konkretnego ograniczenia. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = asPgError(err);
  return (
    e?.code === '23505' &&
    (constraint === undefined || e.constraint_name === constraint)
  );
}

/** 23503 = naruszenie klucza obcego. */
export function isForeignKeyViolation(
  err: unknown,
  constraint?: string,
): boolean {
  const e = asPgError(err);
  return (
    e?.code === '23503' &&
    (constraint === undefined || e.constraint_name === constraint)
  );
}
