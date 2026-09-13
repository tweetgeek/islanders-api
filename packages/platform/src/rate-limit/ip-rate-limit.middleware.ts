import type { NextFunction, Request, Response } from 'express';
import type { RateLimiter } from './rate-limiter.js';

/**
 * Sufit po adresie na WSZYSTKICH trasach, liczony przed uwierzytelnieniem. Bez niego zalew
 * żądań ze złym tokenem odbijał się od strażnika JWT, zanim cokolwiek policzył limiter.
 */
export function ipRateLimitMiddleware(limiter: RateLimiter, limit: number) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const decision = await limiter.hit('ip-global', req.ip ?? 'unknown', limit);
    if (decision.allowed) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(decision.retryAfterSeconds));
    res.status(429).json({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Za dużo żądań, spróbuj za chwilę',
    });
  };
}
