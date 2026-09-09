import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { FixedClock } from '../../domain/time/index.js';
import { ServerTimeInterceptor } from './server-time.interceptor.js';

import { serverTimeMiddleware } from './server-time.middleware.js';

const clock = new FixedClock(new Date('2026-09-08T12:00:00.000Z'));

function run(body: unknown) {
  const ctx = {} as ExecutionContext;
  const next = { handle: () => of(body) } as CallHandler;
  return lastValueFrom(new ServerTimeInterceptor(clock).intercept(ctx, next));
}

describe('ServerTimeInterceptor', () => {
  it('dokłada pole serverTime do odpowiedzi-obiektu', async () => {
    expect(await run({ id: '1' })).toEqual({
      id: '1',
      serverTime: '2026-09-08T12:00:00.000Z',
    });
  });

  it('tablice, null, undefined i tekst zostają nietknięte', async () => {
    for (const body of [[{ id: '1' }], null, undefined, 'tekst']) {
      expect(await run(body)).toEqual(body);
    }
  });
});

describe('serverTimeMiddleware', () => {
  it('ustawia X-Server-Time i przekazuje dalej', () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v) };
    let called = false;
    serverTimeMiddleware(clock)(
      {} as never,
      res as never,
      () => (called = true),
    );
    expect(headers['X-Server-Time']).toBe('2026-09-08T12:00:00.000Z');
    expect(called).toBe(true);
  });
});
