import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { ROLES, type Role } from '@islanders/contracts';
import type { Clock } from '@islanders/domain/time';
import { CLOCK, DB } from '@islanders/platform';
import type { AuthDb } from '../db/db.js';
import { PlayersRepository, type PlayerRow } from './players.repository.js';
import { ARGON2_OPTIONS } from './auth.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

export class PlayerNotFoundError extends Error {
  constructor(email: string) {
    super(`Nie ma konta ${email}`);
    this.name = 'PlayerNotFoundError';
  }
}

export class InvalidRoleChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRoleChangeError';
  }
}

export class InvalidPasswordError extends Error {
  constructor() {
    super('Hasło musi mieć od 8 do 128 znaków');
    this.name = 'InvalidPasswordError';
  }
}

/** Operacje technika wywoływane z CLI. Bez tras HTTP — role nadaje się poza aplikacją. */
@Injectable()
export class PlayersAdmin {
  constructor(
    private readonly players: PlayersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    @Inject(DB) private readonly db: AuthDb,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async changeRoles(email: string, add: Role[], remove: Role[]): Promise<Role[]> {
    for (const role of [...add, ...remove]) {
      if (!(ROLES as readonly string[]).includes(role)) {
        throw new InvalidRoleChangeError(`Nieznana rola ${role}`);
      }
    }
    if (remove.includes('player')) {
      throw new InvalidRoleChangeError('Roli player nie można odebrać');
    }
    const player = await this.require(email);
    const next = ROLES.filter(
      (r) => (player.roles.includes(r) || add.includes(r)) && !remove.includes(r),
    );
    await this.players.setRoles(player.id, next);
    return next;
  }

  async setPassword(email: string, password: string): Promise<void> {
    if (password.length < 8 || password.length > 128) {
      throw new InvalidPasswordError();
    }
    const player = await this.require(email);
    const hash = await argon2.hash(password, ARGON2_OPTIONS);
    await this.db.transaction(async (tx) => {
      // Blokada wiersza gracza FOR UPDATE serializuje z `AuthService.refresh` (FOR SHARE): bez tego
      // równoległe odświeżenie mogłoby wstawić nowy refresh token już po tym, jak ta transakcja
      // odczytała stan tokenów, ale przed ich unieważnieniem.
      await this.players.findById(player.id, tx, 'update');
      await this.players.setPasswordHash(tx, player.id, hash);
      await this.refreshTokens.revokeAllForPlayer(tx, player.id, this.clock.now());
    });
  }

  async disable(email: string): Promise<void> {
    const player = await this.require(email);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      // Jak w setPassword — FOR UPDATE zanim odczytamy/unieważnimy tokeny.
      await this.players.findById(player.id, tx, 'update');
      await this.players.setDisabledAt(tx, player.id, now);
      await this.refreshTokens.revokeAllForPlayer(tx, player.id, now);
    });
  }

  async enable(email: string): Promise<void> {
    const player = await this.require(email);
    await this.players.setDisabledAt(this.db, player.id, null);
  }

  private async require(email: string): Promise<PlayerRow> {
    const player = await this.players.findByEmail(email);
    if (!player) throw new PlayerNotFoundError(email);
    return player;
  }
}
