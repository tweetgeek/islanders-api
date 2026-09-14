import { randomInt } from 'node:crypto';
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { STARTER_PACK, startingBuildings } from '@islanders/domain/balance';
import type { Clock } from '@islanders/domain/time';
import type { PlayerPrincipal } from '../../access/player-request.js';
import { DB, type Db } from '../../infra/db/db.module.js';
import { isUniqueViolation } from '../../infra/db/pg-errors.js';
import { CLOCK } from '../../infra/time/time.module.js';
import { WorldSettingsRepository, type WorldSettingsRow } from '../../world/world-settings.repository.js';
import { ProfilesRepository } from '../profiles/profiles.repository.js';
import { coordKey } from '../settlements/bbox.js';
import { type OwnSettlementView, ownView } from '../settlements/settlement-views.js';
import { SettlementsRepository } from '../settlements/settlements.repository.js';
import { pickHomeIsland } from './home-island-picker.js';

const JOIN_ATTEMPTS = 3;
const DEFAULT_SETTLEMENT_NAME = 'Osada';

@Injectable()
export class JoinService {
  constructor(
    private readonly worlds: WorldSettingsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly settlements: SettlementsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Zakłada profil i osadę domową w jednej transakcji; powtarza losowanie po konflikcie klucza osady. */
  async join(world: WorldSettingsRow, player: PlayerPrincipal, name?: string): Promise<OwnSettlementView> {
    // Szybka ścieżka na nieblokowanym odczycie sprzed transakcji — omija bazę dla oczywistych przypadków.
    if (world.status !== 'OPEN') {
      throw new ConflictException('Świat nie przyjmuje nowych graczy');
    }
    if (await this.profiles.find(player.id)) {
      throw new ConflictException('Masz już profil na tym świecie');
    }
    const settlementName = name ?? DEFAULT_SETTLEMENT_NAME;

    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt++) {
      const taken = await this.settlements.listCoords();
      const pick = pickHomeIsland(world, (x, y) => taken.has(coordKey(x, y)), (n) => randomInt(n));
      if (!pick) {
        throw new ConflictException('Świat jest pełny: brak wolnej wyspy na osadę domową');
      }
      const now = this.clock.now();
      try {
        await this.db.transaction(async (tx) => {
          // Blokada FOR SHARE serializuje się z WorldStatusService (FOR UPDATE): jeśli świat
          // przestał być OPEN tuż po nieblokowanym odczycie wyżej, ta transakcja to zobaczy.
          const current = await this.worlds.findForShare(tx);
          if (current?.status !== 'OPEN') {
            throw new ConflictException('Świat nie przyjmuje nowych graczy');
          }
          await this.profiles.create(tx, {
            playerId: player.id,
            nickname: player.nickname,
            homeX: pick.x,
            homeY: pick.y,
          });
          await this.settlements.insertWithBuildings(tx, {
            x: pick.x,
            y: pick.y,
            ownerId: player.id,
            name: settlementName,
            biome: pick.biome,
            resources: STARTER_PACK,
            lastSyncAt: now,
            buildings: startingBuildings(pick.biome),
          });
        });
      } catch (err) {
        // Ktoś wziął tę wyspę w międzyczasie — losujemy jeszcze raz. Współrzędne osady chronią
        // DWA ograniczenia unikalne, więc obie nazwy prowadzą do ponowienia, nie do błędu serwera.
        if (isUniqueViolation(err, 'settlements_pk') || isUniqueViolation(err, 'settlements_xy_biome_unique')) {
          continue;
        }
        if (isUniqueViolation(err, 'profiles_pkey')) {
          throw new ConflictException('Masz już profil na tym świecie');
        }
        if (isUniqueViolation(err, 'profiles_nickname_unique')) {
          throw new ConflictException('Pseudonim jest już zajęty na tym świecie');
        }
        throw err;
      }
      const record = await this.settlements.findOne(pick.x, pick.y);
      if (!record) {
        throw new Error('Osada domowa zniknęła tuż po założeniu');
      }
      return ownView(record, world.slug, now);
    }
    throw new ConflictException('Nie udało się wylosować wolnej wyspy, spróbuj ponownie');
  }
}
