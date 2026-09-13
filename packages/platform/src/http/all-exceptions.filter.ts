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
import { describeError } from '../db/pg-errors.js';

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
      describeError(exception),
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
