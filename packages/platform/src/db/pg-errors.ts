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

/**
 * Kod SQLSTATE wyłuskany z łańcucha przyczyn albo `null`, gdy błąd nie pochodzi ze sterownika.
 * Sam kod jest bezpieczny do zalogowania — w przeciwieństwie do komunikatu `DrizzleQueryError`,
 * który niesie w sobie parametry zapytania.
 */
export function pgErrorCode(err: unknown): string | null {
  return asPgError(err)?.code ?? null;
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

/**
 * Szczegóły awarii do logu, z jednym wyjątkiem od reguły „loguj stos".
 *
 * `drizzle-orm` 0.45 buduje komunikat `DrizzleQueryError` jako `Failed query: <sql>\nparams: <p>`,
 * a komunikat jest częścią stosu. Parametry zapisu to u nas skrót argon2 hasła
 * (`PlayersRepository.create`) albo skrót tokenu odświeżającego (`RefreshTokensRepository.create`),
 * czyli artefakty równoważne poświadczeniu. Log trafia do systemu o innym modelu dostępu niż baza,
 * więc dla takiego błędu logujemy nazwę, treść zapytania i kod SQLSTATE, a NIGDY `params` ani stosu.
 *
 * Rozpoznajemy błąd po kształcie (`query: string` + `params: unknown[]`), a nie przez `instanceof`:
 * warstwa HTTP nie musi wtedy importować klasy z `drizzle-orm`, a osłona działa też dla błędów
 * opakowanych przez inne wersje sterownika.
 */
export function describeError(exception: unknown): string {
  if (typeof exception === 'object' && exception !== null) {
    const e = exception as {
      name?: unknown;
      query?: unknown;
      params?: unknown;
      cause?: unknown;
    };
    if (typeof e.query === 'string' && Array.isArray(e.params)) {
      const name = typeof e.name === 'string' ? e.name : 'DrizzleQueryError';
      const code = pgErrorCode(exception) ?? 'brak';
      return `${name}: kod ${code}, zapytanie: ${e.query} (parametry i ślad stosu pominięte celowo)`;
    }
  }
  return exception instanceof Error
    ? (exception.stack ?? exception.message)
    : String(exception);
}
