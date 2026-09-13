import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type AuthDb, type AuthDbClient } from '../db/db.js';
import { refreshTokens } from '../db/schema/index.js';

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(DB) private readonly db: AuthDb) {}

  async create(
    client: AuthDbClient,
    input: { playerId: string; tokenHash: string; expiresAt: Date },
  ): Promise<RefreshTokenRow> {
    const [row] = await client.insert(refreshTokens).values(input).returning();
    return row;
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    return row;
  }

  /** Blokuje wiersz do końca transakcji: dwa równoległe odświeżenia tym samym tokenem idą po kolei. */
  async findByHashForUpdate(client: AuthDbClient, tokenHash: string): Promise<RefreshTokenRow | undefined> {
    const [row] = await client
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .for('update');
    return row;
  }

  /** `replacedById` ustawione = rotacja (podlega oknu łaski); brak = logout (natychmiastowe). */
  async revoke(client: AuthDbClient, id: string, at: Date, replacedById: string | null): Promise<void> {
    await client.update(refreshTokens).set({ revokedAt: at, replacedById }).where(eq(refreshTokens.id, id));
  }

  async revokeAllForPlayer(client: AuthDbClient, playerId: string, at: Date): Promise<void> {
    await client
      .update(refreshTokens)
      .set({ revokedAt: at, replacedById: null })
      .where(and(eq(refreshTokens.playerId, playerId), isNull(refreshTokens.revokedAt)));
  }
}
