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

/** Te same parametry przy rejestracji i przy atrapie — inaczej czasy się rozjadą. */
const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

let dummyHash: Promise<string> | undefined;

/**
 * Atrapa skrótu dla logowania na nieistniejące konto. Bez niej odpowiedź wraca od razu,
 * a dla istniejącego konta dopiero po weryfikacji argon2 — i sam czas odpowiedzi zdradza
 * to, co identyczny komunikat miał ukryć. Weryfikujemy więc hasło wobec tej atrapy i
 * wynik wyrzucamy. NIE USUWAĆ: to nie jest martwy kod, tylko wyrównanie czasu odpowiedzi.
 * Liczona leniwie i tylko raz — argon2 jest kosztowny z założenia.
 */
function dummyPasswordHash(): Promise<string> {
  dummyHash ??= argon2.hash('atrapa-hasla-do-wyrownania-czasu', ARGON2_OPTIONS);
  return dummyHash;
}

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
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
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
    if (!player) {
      // Weryfikacja atrapy przed rzuceniem wyjątku, żeby czas odpowiedzi był ten sam
      // co przy złym haśle do istniejącego konta. Wynik celowo ignorujemy.
      await argon2.verify(await dummyPasswordHash(), input.password);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    if (!(await argon2.verify(player.passwordHash, input.password))) {
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
