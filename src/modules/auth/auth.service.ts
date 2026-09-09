import {
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { Clock } from '../../domain/time/index.js';
import { ENV } from '../../infra/config/config.module.js';
import type { Env } from '../../infra/config/env.js';
import { isUniqueViolation } from '../../infra/db/pg-errors.js';
import { CLOCK } from '../../infra/time/time.module.js';
import {
  PlayersRepository,
  type PlayerRow,
} from '../players/players.repository.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';
import {
  REFRESH_GRACE_MS,
  generateRefreshToken,
  hashRefreshToken,
} from './tokens.js';

export interface AuthResult {
  playerId: number;
  nickname: string;
  accessToken: string;
  refreshToken: string;
}

const BAD_CREDENTIALS = 'Błędny e-mail lub hasło';

@Injectable()
export class AuthService {
  constructor(
    private readonly players: PlayersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async register(input: {
    email: string;
    nickname: string;
    password: string;
  }): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });
    let player: PlayerRow;
    try {
      player = await this.players.create({
        email: input.email,
        nickname: input.nickname,
        passwordHash,
      });
    } catch (err) {
      if (isUniqueViolation(err, 'players_email_unique')) {
        throw new ConflictException({
          statusCode: 409,
          message: 'E-mail jest już zajęty',
          field: 'email',
        });
      }
      if (isUniqueViolation(err, 'players_nickname_unique')) {
        throw new ConflictException({
          statusCode: 409,
          message: 'Pseudonim jest już zajęty',
          field: 'nickname',
        });
      }
      throw err;
    }
    const { refreshTokenId: _issued, ...result } = await this.issue(player);
    return result;
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const player = await this.players.findByEmail(input.email);
    // Jedna treść błędu dla obu przypadków, żeby nie zdradzać, czy konto istnieje.
    if (
      !player ||
      !(await argon2.verify(player.passwordHash, input.password))
    ) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    const { refreshTokenId: _issued, ...result } = await this.issue(player);
    return result;
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const now = this.clock.now();
    const row = await this.refreshTokens.findByHash(
      hashRefreshToken(refreshToken),
    );
    if (!row || row.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Refresh token nieważny');
    }
    if (row.revokedAt) {
      const rotated = row.replacedById !== null;
      const withinGrace =
        now.getTime() - row.revokedAt.getTime() <= REFRESH_GRACE_MS;
      if (!rotated || !withinGrace) {
        throw new UnauthorizedException('Refresh token unieważniony');
      }
    }
    const player = await this.players.findById(row.playerId);
    if (!player) {
      throw new UnauthorizedException('Refresh token nieważny');
    }
    const { refreshTokenId, ...result } = await this.issue(player);
    if (!row.revokedAt) {
      await this.refreshTokens.revoke(row.id, now, refreshTokenId);
    }
    return result;
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.refreshTokens.findByHash(
      hashRefreshToken(refreshToken),
    );
    if (row && !row.revokedAt) {
      await this.refreshTokens.revoke(row.id, this.clock.now(), null);
    }
  }

  private async issue(
    player: PlayerRow,
  ): Promise<AuthResult & { refreshTokenId: string }> {
    const now = this.clock.now();
    const accessToken = await this.jwt.signAsync({ sub: String(player.id) });
    const refreshToken = generateRefreshToken();
    const row = await this.refreshTokens.create({
      playerId: player.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.env.JWT_REFRESH_TTL * 1000),
    });
    return {
      playerId: player.id,
      nickname: player.nickname,
      accessToken,
      refreshToken,
      refreshTokenId: row.id,
    };
  }
}
