import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from '@islanders/platform';
import { JwksProvider } from './jwks-provider.js';
import { PlayerTokenGuard } from './player-token.guard.js';
import { TokenVerifier } from './token-verifier.js';

/**
 * Kolejność globalnych strażników jest kolejnością rejestracji: PlayerTokenGuard musi działać
 * przed RateLimitGuard, żeby limiter widział `req.rateLimitSubject`. Oba w jednej tablicy providerów.
 */
@Module({
  providers: [
    JwksProvider,
    TokenVerifier,
    { provide: APP_GUARD, useClass: PlayerTokenGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
  exports: [JwksProvider, TokenVerifier],
})
export class AccessModule {}
