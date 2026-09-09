import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, isNull, or } from 'drizzle-orm';
import { DB, type Db } from '../../infra/db/db.module.js';
import { fleets, players, settlements } from '../../infra/db/schema/index.js';
import type { FleetRecord } from './fleet-views.js';

@Injectable()
export class FleetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Nierozstrzygnięte floty gracza oraz cudze ATTACK, których celem jest osada gracza. */
  listVisible(worldId: number, playerId: number): Promise<FleetRecord[]> {
    const targetsMine = exists(
      this.db
        .select({ x: settlements.x })
        .from(settlements)
        .where(
          and(
            eq(settlements.worldId, fleets.worldId),
            eq(settlements.x, fleets.toX),
            eq(settlements.y, fleets.toY),
            eq(settlements.ownerId, playerId),
          ),
        ),
    );
    return this.db
      .select({
        id: fleets.id,
        worldId: fleets.worldId,
        ownerId: fleets.ownerId,
        ownerName: players.nickname,
        mission: fleets.mission,
        fromX: fleets.fromX,
        fromY: fleets.fromY,
        toX: fleets.toX,
        toY: fleets.toY,
        ships: fleets.ships,
        cargo: fleets.cargo,
        departAt: fleets.departAt,
        arriveAt: fleets.arriveAt,
      })
      .from(fleets)
      .innerJoin(players, eq(players.id, fleets.ownerId))
      .where(
        and(
          eq(fleets.worldId, worldId),
          isNull(fleets.resolvedAt),
          or(
            eq(fleets.ownerId, playerId),
            and(eq(fleets.mission, 'ATTACK'), targetsMine),
          ),
        ),
      )
      .orderBy(asc(fleets.arriveAt));
  }
}
