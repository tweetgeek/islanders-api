import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import {
  AUDIENCE,
  toolsClaimsSchema,
  worldsAccessClaimsSchema,
  type ToolsClaims,
  type WorldsAccessClaims,
} from '@islanders/contracts';
import { ENV } from '@islanders/platform';
import type { Env } from '../infra/config/env.js';
import { JwksProvider } from './jwks-provider.js';

/**
 * Weryfikacja tokenu z auth. Ważność (`exp`) liczona wobec czasu rzeczywistego, nie zegara gry.
 * Nieznany `kid` wymusza jedno odświeżenie JWKS (z bramką 30 s) i ponowną próbę.
 */
@Injectable()
export class TokenVerifier {
  constructor(
    private readonly jwks: JwksProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  verify(token: string, audience: 'worlds'): Promise<WorldsAccessClaims>;
  verify(token: string, audience: 'tools'): Promise<ToolsClaims>;
  async verify(token: string, audience: 'worlds' | 'tools'): Promise<WorldsAccessClaims | ToolsClaims> {
    let keySet = this.jwks.current();
    if (!keySet && (await this.jwks.refreshAfterUnknownKid())) {
      keySet = this.jwks.current();
    }
    if (!keySet) {
      throw new ServiceUnavailableException('Usługa kont niedostępna');
    }
    try {
      return await this.check(token, audience, keySet);
    } catch (err) {
      if (err instanceof errors.JWKSNoMatchingKey && (await this.jwks.refreshAfterUnknownKid())) {
        try {
          return await this.check(token, audience, this.jwks.current()!);
        } catch {
          throw new UnauthorizedException('Token nieważny lub wygasły');
        }
      }
      throw new UnauthorizedException('Token nieważny lub wygasły');
    }
  }

  private async check(
    token: string,
    audience: 'worlds' | 'tools',
    keySet: JWTVerifyGetKey,
  ): Promise<WorldsAccessClaims | ToolsClaims> {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: this.env.AUTH_ISSUER,
      audience: AUDIENCE[audience],
      algorithms: ['EdDSA'],
    });
    return audience === 'worlds' ? worldsAccessClaimsSchema.parse(payload) : toolsClaimsSchema.parse(payload);
  }
}
