import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { refreshTokens } from '../../infra/db/schema/index.js';

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;

@Injectable()
export class RefreshTokensRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: {
    playerId: number;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenRow> {
    const [row] = await this.db.insert(refreshTokens).values(input).returning();
    return row;
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
    return this.db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.tokenHash, tokenHash),
    });
  }

  /** `replacedById` ustawione = rotacja (podlega oknu łaski); brak = logout (natychmiastowe). */
  async revoke(
    id: string,
    at: Date,
    replacedById: string | null,
  ): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: at, replacedById })
      .where(eq(refreshTokens.id, id));
  }
}
