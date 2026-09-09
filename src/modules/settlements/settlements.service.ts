import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '../../domain/time/index.js';
import { CLOCK } from '../../infra/time/time.module.js';
import type { WorldRow } from '../worlds/worlds.repository.js';
import { parseBbox } from './bbox.js';
import {
  type OwnSettlementView,
  type PublicSettlementView,
  viewFor,
} from './settlement-views.js';
import { SettlementsRepository } from './settlements.repository.js';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly settlements: SettlementsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bez bbox: własne osady w pełni. Z bbox: wszystkie w prostokącie, własne w pełni, cudze publicznie. */
  async list(
    world: WorldRow,
    requesterId: number,
    bboxRaw?: string,
  ): Promise<(PublicSettlementView | OwnSettlementView)[]> {
    const now = this.clock.now();
    const records =
      bboxRaw === undefined
        ? await this.settlements.listOwn(world.id, requesterId)
        : await this.settlements.listInBbox(
            world.id,
            parseBbox(bboxRaw, world),
          );
    return records.map((r) => viewFor(r, requesterId, now));
  }
}
