import {
  ConflictException,
  Inject,
  Injectable,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import type { Role } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, DB, ENV, isUniqueViolation } from '@islanders/platform';
import type { AuthEnv } from '../config/env.js';
import type { AuthDb, AuthDbClient } from '../db/db.js';
import { TokenIssuer } from '../tokens/token-issuer.js';
import { PlayersRepository, type PlayerRow } from './players.repository.js';
import { REFRESH_GRACE_MS, generateRefreshToken, hashRefreshToken } from './refresh-tokens.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

export interface AuthResult {
  playerId: string;
  nickname: string;
  roles: Role[];
  accessToken: string;
  refreshToken: string;
}

const BAD_CREDENTIALS = 'Błędny e-mail lub hasło';

/**
 * Te same parametry przy rejestracji i przy atrapie — inaczej czasy się rozjadą. Koszty jawnie,
 * bo zmiana domyślnych wartości argon2 rozjechałaby koszt atrapy z kosztem zapisanych skrótów
 * i kanał czasowy wróciłby po cichu. Wartości = domyślne argon2 0.45.1.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
} as const;

const DUMMY_PASSWORD = 'atrapa-hasla-do-wyrownania-czasu';

@Injectable()
export class AuthService implements OnModuleInit {
  /** Atrapa dla nieznanego konta. NIE USUWAĆ: wyrównuje czas odpowiedzi (spec A §8). */
  private dummyPasswordHash: string;

  constructor(
    private readonly players: PlayersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly issuer: TokenIssuer,
    @Inject(DB) private readonly db: AuthDb,
    @Inject(ENV) private readonly env: AuthEnv,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(DUMMY_PASSWORD, ARGON2_OPTIONS);
  }

  async register(input: { email: string; nickname: string; password: string }): Promise<AuthResult> {
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    let player: PlayerRow;
    try {
      player = await this.players.create({ ...input, passwordHash });
    } catch (err) {
      if (isUniqueViolation(err, 'players_email_unique')) {
        throw this.conflict('E-mail jest już zajęty', 'email');
      }
      if (isUniqueViolation(err, 'players_nickname_unique')) {
        throw this.conflict('Pseudonim jest już zajęty', 'nickname');
      }
      throw err;
    }
    return this.issueInTransaction(player);
  }

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    return this.issueInTransaction(await this.verifyCredentials(input));
  }

  private async issueInTransaction(player: PlayerRow): Promise<AuthResult> {
    const { refreshTokenId: _id, ...result } = await this.db.transaction((tx) =>
      this.issue(tx, player),
    );
    return result;
  }

  /** Wspólne dla logowania gracza i logowania do tools. Zablokowane konto: ta sama treść 401. */
  async verifyCredentials(input: { email: string; password: string }): Promise<PlayerRow> {
    const player = await this.players.findByEmail(input.email);
    if (!player) {
      await argon2.verify(this.dummyPasswordHash, input.password);
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    if (!(await argon2.verify(player.passwordHash, input.password)) || player.disabledAt) {
      throw new UnauthorizedException(BAD_CREDENTIALS);
    }
    return player;
  }

  /** Rotacja w jednej transakcji z blokadą wiersza starego tokenu (spec A §15.1). */
  refresh(refreshToken: string): Promise<AuthResult> {
    return this.db.transaction(async (tx) => {
      const now = this.clock.now();
      const row = await this.refreshTokens.findByHashForUpdate(tx, hashRefreshToken(refreshToken));
      if (!row || row.expiresAt.getTime() <= now.getTime()) {
        throw new UnauthorizedException('Refresh token nieważny');
      }
      if (row.revokedAt) {
        const rotated = row.replacedById !== null;
        const withinGrace = now.getTime() - row.revokedAt.getTime() <= REFRESH_GRACE_MS;
        if (!rotated || !withinGrace) {
          throw new UnauthorizedException('Refresh token unieważniony');
        }
      }
      const player = await this.players.findById(row.playerId, tx);
      if (!player || player.disabledAt) {
        throw new UnauthorizedException('Refresh token nieważny');
      }
      const result = await this.issue(tx, player);
      // Token wydany w oknie łaski nie jest linkowany z `replacedById`: kolumna zapisuje tylko
      // pierwsze ogniwo, a nadpisanie przesunęłoby `revokedAt`, czyli przedłużyło okno.
      if (!row.revokedAt) {
        await this.refreshTokens.revoke(tx, row.id, now, result.refreshTokenId);
      }
      const { refreshTokenId: _id, ...out } = result;
      return out;
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!row) return;
    if (!row.revokedAt) {
      await this.refreshTokens.revoke(this.db, row.id, this.clock.now(), null);
      return;
    }
    if (row.replacedById !== null) {
      // Wylogowanie starym tokenem w oknie łaski: zdejmujemy znacznik rotacji, zachowując `revokedAt`.
      await this.refreshTokens.revoke(this.db, row.id, row.revokedAt, null);
    }
  }

  private async issue(
    client: AuthDbClient,
    player: PlayerRow,
  ): Promise<AuthResult & { refreshTokenId: string }> {
    const now = this.clock.now();
    const access = await this.issuer.worldsAccess(player);
    const refreshToken = generateRefreshToken();
    const row = await this.refreshTokens.create(client, {
      playerId: player.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(now.getTime() + this.env.JWT_REFRESH_TTL * 1000),
    });
    return {
      playerId: player.id,
      nickname: player.nickname,
      roles: player.roles,
      accessToken: access.token,
      refreshToken,
      refreshTokenId: row.id,
    };
  }

  private conflict(message: string, field: string): ConflictException {
    return new ConflictException({ statusCode: 409, error: 'Conflict', message, field });
  }
}
