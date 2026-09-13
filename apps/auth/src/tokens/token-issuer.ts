import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT } from 'jose';
import { AUDIENCE, serviceSubject, type Role } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, ENV } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import { SIGNING_KEYS, type SigningKeys } from '../keys/signing-keys.js';

export const TOOLS_TOKEN_TTL_SECONDS = 3600;
export const SERVICE_TOKEN_TTL_SECONDS = 300;

export interface TokenPlayer {
  id: string;
  roles: Role[];
  nickname: string;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenIssuer {
  constructor(
    @Inject(SIGNING_KEYS) private readonly keys: SigningKeys,
    @Inject(ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  worldsAccess(player: TokenPlayer): Promise<IssuedToken> {
    return this.sign(
      { roles: player.roles, nickname: player.nickname },
      AUDIENCE.worlds,
      player.id,
      this.env.JWT_ACCESS_TTL,
    );
  }

  tools(player: TokenPlayer): Promise<IssuedToken> {
    return this.sign({ roles: player.roles }, AUDIENCE.tools, player.id, TOOLS_TOKEN_TTL_SECONDS);
  }

  service(worldSlug: string): Promise<IssuedToken> {
    return this.sign({}, AUDIENCE.internal, serviceSubject(worldSlug), SERVICE_TOKEN_TTL_SECONDS);
  }

  private async sign(
    claims: Record<string, unknown>,
    audience: string,
    subject: string,
    ttlSeconds: number,
  ): Promise<IssuedToken> {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const exp = iat + ttlSeconds;
    const token = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: this.keys.activeKid, typ: 'JWT' })
      .setIssuer(this.env.AUTH_ISSUER)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .setJti(randomUUID())
      .sign(this.keys.activeKey);
    return { token, expiresAt: new Date(exp * 1000) };
  }
}
