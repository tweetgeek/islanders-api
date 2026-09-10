import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { pgErrorCode } from '../db/pg-errors.js';

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
function detailsFor(exception: unknown): string {
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

/** HttpException przechodzi bez zmian; wszystko inne to 500 z identyfikatorem w logu, bez szczegółów dla klienta. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      // Zamierzona część kontraktu, nie awaria — nie logujemy. Po wysłanych nagłówkach
      // zostaje tylko pominąć zapis: `res.status()` rzuciłby wtedy wewnątrz filtra.
      if (res.headersSent) return;
      const body = exception.getResponse();
      res
        .status(exception.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: exception.getStatus(), message: body }
            : body,
        );
      return;
    }

    // Log BEZWARUNKOWO, także po wysłanych nagłówkach. Wtedy jest tym bardziej potrzebny:
    // do klienta i tak nic już nie dopiszemy, więc log jest jedynym śladem awarii.
    const errorId = randomUUID();
    this.logger.error(
      `[${errorId}] ${req.method} ${req.url}`,
      detailsFor(exception),
    );

    // Strzeżemy wyłącznie zapisu do odpowiedzi — `res.status()` po wysłanych nagłówkach
    // rzuciłby wewnątrz filtra i obsługę przejąłby domyślny mechanizm Node'a.
    if (res.headersSent) return;
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Błąd serwera',
      errorId,
    });
  }
}
