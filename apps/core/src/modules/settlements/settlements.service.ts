import { Inject, Injectable } from '@nestjs/common';
import type { Clock } from '@islanders/domain/time';
import { CLOCK } from '../../infra/time/time.module.js';
import type { WorldSettingsRow } from '../../world/world-settings.repository.js';
import { parseBbox } from './bbox.js';
import { type OwnSettlementView, type PublicSettlementView, viewFor } from './settlement-views.js';
import { SettlementsRepository } from './settlements.repository.js';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly settlements: SettlementsRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Bez bbox: własne osady w pełni. Z bbox: wszystkie w prostokącie, własne w pełni, cudze publicznie. */
  async list(
    world: WorldSettingsRow,
    requesterId: string,
    bboxRaw?: string,
  ): Promise<(PublicSettlementView | OwnSettlementView)[]> {
    const now = this.clock.now();
    const records =
      bboxRaw === undefined
        ? await this.settlements.listOwn(requesterId)
        : await this.settlements.listInBbox(parseBbox(bboxRaw, world));
    return records.map((r) => viewFor(r, world.slug, requesterId, now));
  }
}
