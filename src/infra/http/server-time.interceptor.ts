import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import type { Clock } from '../../domain/time/index.js';
import { CLOCK } from '../time/time.module.js';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Pole `serverTime` tylko w odpowiedziach-obiektach; tablice zostają tablicami (klient parsuje listy jako Array). */
@Injectable()
export class ServerTimeInterceptor implements NestInterceptor {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const serverTime = this.clock.now().toISOString();
    return next
      .handle()
      .pipe(
        map((body: unknown) =>
          isPlainObject(body) ? { ...body, serverTime } : body,
        ),
      );
  }
}
