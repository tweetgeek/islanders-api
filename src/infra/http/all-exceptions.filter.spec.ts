import { ArgumentsHost, ForbiddenException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface Recorded {
  status?: number;
  body?: unknown;
  calls: number;
}

/** Atrapa `ArgumentsHost` — filtr nie potrzebuje ani trasy, ani kontenera, ani bazy. */
function makeHost(headersSent = false): { host: ArgumentsHost; res: Recorded } {
  const res: Recorded = { calls: 0 };
  const response = {
    headersSent,
    status(code: number) {
      res.status = code;
      res.calls++;
      return this;
    },
    json(body: unknown) {
      res.body = body;
    },
  };
  const request = { method: 'GET', url: '/api/v1/cokolwiek' };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost,
    res,
  };
}

/**
 * Kształt `DrizzleQueryError` z drizzle-orm 0.45 (`node_modules/drizzle-orm/errors.cjs`):
 * parametry zapytania wklejone do komunikatu, oryginalny błąd sterownika pod `cause`.
 * Odtwarzamy go tutaj zamiast importować, bo test ma dowodzić rozpoznania po KSZTAŁCIE.
 */
class FakeDrizzleQueryError extends Error {
  constructor(
    readonly query: string,
    readonly params: unknown[],
    cause: unknown,
  ) {
    super(`Failed query: ${query}\nparams: ${params}`);
    this.name = 'DrizzleQueryError';
    this.cause = cause;
  }
}

describe('AllExceptionsFilter', () => {
  // Wszystkie argumenty loggera, nie tylko dwa pierwsze: test wycieku musi widzieć każdy.
  let logged: unknown[][];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = [];
    spy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((...args: unknown[]) => {
        logged.push(args);
      });
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('wyjątek HTTP przechodzi ze statusem i ciałem bez zmian', () => {
    const { host, res } = makeHost();
    const exception = new ForbiddenException('Nie twój świat');
    new AllExceptionsFilter().catch(exception, host);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(exception.getResponse());
    expect(logged).toEqual([]);
  });

  it('zwykły błąd: 500 bez treści wyjątku, szczegóły tylko do logu', () => {
    const { host, res } = makeHost();
    const secret = 'connect ECONNREFUSED 10.0.0.7:5432 haslo=tajne';
    new AllExceptionsFilter().catch(new Error(secret), host);

    expect(res.status).toBe(500);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'error',
      'errorId',
      'message',
      'statusCode',
    ]);
    expect(body.statusCode).toBe(500);
    expect(body.error).toBe('Internal Server Error');
    expect(body.message).toBe('Błąd serwera');
    expect(body.errorId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Sedno: nic z rzuconego błędu nie może wyciec do klienta.
    expect(JSON.stringify(body)).not.toContain('tajne');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');

    // ...ale musi trafić do logu, powiązane tym samym identyfikatorem.
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toContain(String(body.errorId));
    expect(logged[0][0]).toContain('GET /api/v1/cokolwiek');
    expect(logged[0][1]).toContain(secret);
  });

  it('błąd zapytania Drizzle: parametry nie trafiają do logu, zapytanie i kod tak', () => {
    const { host, res } = makeHost();
    // Dokładnie ten parametr, który zapisuje `PlayersRepository.create`.
    const passwordHash =
      '$argon2id$v=19$m=65536,t=3,p=4$c29sZHNvbHQ$2SkRet9EYEbjBqoJoRWnRHTajnSMBQzZ0LzE9nRTaGM';
    const query =
      'insert into "players" ("email", "nickname", "password_hash") values ($1, $2, $3) returning "id", "nickname"';
    const exception = new FakeDrizzleQueryError(
      query,
      ['gracz@example.com', 'koralowy_kapitan', passwordHash],
      Object.assign(new Error('connection terminated'), { code: '08006' }),
    );

    new AllExceptionsFilter().catch(exception, host);

    // Kontrakt odpowiedzi bez zmian: 500 z identyfikatorem, nic z wyjątku dla klienta.
    expect(res.status).toBe(500);
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual([
      'error',
      'errorId',
      'message',
      'statusCode',
    ]);
    expect(JSON.stringify(body)).not.toContain('argon2');

    expect(logged).toHaveLength(1);
    const wszystko = logged[0].map(String).join('\n');
    // SEDNO: skrót hasła nie może pojawić się w ŻADNYM argumencie loggera. Trafiłby tam
    // przez `exception.stack`, bo drizzle wkleja parametry do komunikatu błędu.
    expect(wszystko).not.toContain(passwordHash);
    expect(wszystko).not.toContain('argon2');
    expect(wszystko).not.toContain('gracz@example.com');
    expect(wszystko).not.toContain('params:');
    // ...ale diagnostyka ma zostać: identyfikator, trasa, zapytanie, kod SQLSTATE.
    expect(wszystko).toContain(String(body.errorId));
    expect(wszystko).toContain('GET /api/v1/cokolwiek');
    expect(wszystko).toContain(query);
    expect(wszystko).toContain('08006');
    expect(wszystko).toContain('DrizzleQueryError');
  });

  it('nagłówki już wysłane: filtr nie dotyka odpowiedzi, ale awarię i tak loguje', () => {
    const { host, res } = makeHost(true);
    new AllExceptionsFilter().catch(new Error('za późno'), host);

    expect(res.calls).toBe(0);
    expect(res.status).toBeUndefined();
    expect(res.body).toBeUndefined();

    // Do klienta nic już nie dopiszemy, więc log jest JEDYNYM śladem tej awarii.
    // Gdyby straż nagłówków obejmowała też logowanie, wyjątek znikałby po cichu.
    expect(logged).toHaveLength(1);
    expect(logged[0][0]).toMatch(
      /^\[[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\] GET \/api\/v1\/cokolwiek$/,
    );
    expect(logged[0][1]).toContain('za późno');
  });

  it('nagłówki już wysłane, wyjątek HTTP: bez zapisu do odpowiedzi i bez logu', () => {
    const { host, res } = makeHost(true);
    new AllExceptionsFilter().catch(new ForbiddenException('Za późno'), host);

    expect(res.calls).toBe(0);
    expect(res.body).toBeUndefined();
    expect(logged).toEqual([]);
  });
});
