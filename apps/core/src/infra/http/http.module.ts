import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { ServerTimeInterceptor } from './server-time.interceptor.js';

/** Importować PO AuthModule, żeby RateLimitGuard widział `req.rateLimitSubject` ustawione przez JwtAuthGuard. */
@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ServerTimeInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class HttpModule {}
