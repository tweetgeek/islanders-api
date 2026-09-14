import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createLocalJWKSet, jwtVerify } from 'jose';
import type { z } from 'zod';
import {
  AUDIENCE,
  serviceClaimsSchema,
  toolsClaimsSchema,
  worldsAccessClaimsSchema,
} from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { SIGNING_KEYS, type SigningKeys } from '../keys/signing-keys.js';

const SCHEMAS = {
  worlds: worldsAccessClaimsSchema,
  tools: toolsClaimsSchema,
  internal: serviceClaimsSchema,
} as const;

export type ClaimsFor<A extends keyof typeof AUDIENCE> = z.infer<(typeof SCHEMAS)[A]>;

/** Weryfikacja identyczna z tą, którą wykona core: JWKS, iss, aud, exp, a potem kształt claimów. */
@Injectable()
export class TokenVerifier {
  private readonly jwks: ReturnType<typeof createLocalJWKSet>;

  constructor(
    @Inject(SIGNING_KEYS) keys: SigningKeys,
    @Inject(ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.jwks = createLocalJWKSet(keys.jwks);
  }

  async verify<A extends keyof typeof AUDIENCE>(token: string, audience: A): Promise<ClaimsFor<A>> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.env.AUTH_ISSUER,
        audience: AUDIENCE[audience],
        algorithms: ['EdDSA'],
        currentDate: this.clock.now(),
      });
      return SCHEMAS[audience].parse(payload) as ClaimsFor<A>;
    } catch {
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
  }
}
