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

describe('AllExceptionsFilter', () => {
  let logged: [string, string | undefined][];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = [];
    spy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown, stack?: unknown) => {
        logged.push([String(message), stack as string | undefined]);
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

  it('nagłówki już wysłane: filtr nie dotyka odpowiedzi', () => {
    const { host, res } = makeHost(true);
    new AllExceptionsFilter().catch(new Error('za późno'), host);

    expect(res.calls).toBe(0);
    expect(res.status).toBeUndefined();
    expect(res.body).toBeUndefined();
  });
});
