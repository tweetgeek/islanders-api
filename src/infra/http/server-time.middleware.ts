import type { NextFunction, Request, Response } from 'express';
import type { Clock } from '../../domain/time/index.js';

/**
 * Nagłówek na KAŻDEJ odpowiedzi, także 401 ze strażnika i 404 bez trasy — interceptory tam nie docierają,
 * bo działają dopiero po strażnikach i tylko na dopasowanych trasach.
 */
export function serverTimeMiddleware(clock: Clock) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Server-Time', clock.now().toISOString());
    next();
  };
}
