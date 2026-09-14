import { Global, Module } from '@nestjs/common';
import { ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { SIGNING_KEYS, loadSigningKeys } from '../keys/signing-keys.js';
import { AccessTokenGuard, ServiceTokenGuard } from './guards.js';
import { JwksController } from './jwks.controller.js';
import { TokenIssuer } from './token-issuer.js';
import { TokenVerifier } from './token-verifier.js';

@Global()
@Module({
  controllers: [JwksController],
  providers: [
    {
      provide: SIGNING_KEYS,
      inject: [ENV],
      useFactory: (env: AuthEnv) => loadSigningKeys(env.JWT_SIGNING_KEYS),
    },
    TokenIssuer,
    TokenVerifier,
    AccessTokenGuard,
    ServiceTokenGuard,
  ],
  exports: [SIGNING_KEYS, TokenIssuer, TokenVerifier, AccessTokenGuard, ServiceTokenGuard],
})
export class TokensModule {}
