import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENV } from '../config/config.module.js';
import { RateLimiter } from './rate-limiter.js';

export type RateLimitKey = 'ip' | 'subject';

export const RATE_LIMIT = 'rateLimit';
/** Jawny klucz limitu dla trasy, np. `@RateLimit('ip')` na logowaniu; wartość limitu z env. */
export const RateLimit = (key: RateLimitKey) => SetMetadata(RATE_LIMIT, key);

type RateLimitEnv = {
  RATE_LIMIT_AUTH_PER_MINUTE: number;
  RATE_LIMIT_SUBJECT_PER_MINUTE: number;
};

export function tooManyRequests(): HttpException {
  return new HttpException(
    {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Za dużo żądań, spróbuj za chwilę',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Limit na trasie: po adresie i trasie (`@RateLimit('ip')`) albo po podmiocie ustawionym przez
 * strażnika uwierzytelniania w `req.rateLimitSubject`. Musi działać PO tym strażniku.
 * `req.ip` jest wiarygodne tylko przy poprawnie ustawionym `TRUST_PROXY`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: RateLimitEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const req = http.getRequest<{ rateLimitSubject?: string; ip?: string }>();
    const explicit = this.reflector.getAllAndOverride<RateLimitKey | undefined>(RATE_LIMIT, [
      context.getHandler(),
      context.getClass(),
    ]);
    const keyBy: RateLimitKey | null =
      explicit ?? (req.rateLimitSubject !== undefined ? 'subject' : null);
    if (!keyBy) return true;

    const bySubject = keyBy === 'subject' && req.rateLimitSubject !== undefined;
    const decision = bySubject
      ? await this.limiter.hit('subject', req.rateLimitSubject!, this.env.RATE_LIMIT_SUBJECT_PER_MINUTE)
      : await this.limiter.hit(
          `ip:${context.getClass().name}.${context.getHandler().name}`,
          req.ip ?? 'unknown',
          this.env.RATE_LIMIT_AUTH_PER_MINUTE,
        );
    if (!decision.allowed) {
      http.getResponse<{ setHeader(k: string, v: string): void }>()
        .setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw tooManyRequests();
    }
    return true;
  }
}
