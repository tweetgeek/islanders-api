import { randomInt } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { STARTER_PACK, startingBuildings } from '../../domain/balance/index.js';
import type { Clock } from '../../domain/time/index.js';
import { DB, type Db } from '../../infra/db/db.module.js';
import { isUniqueViolation } from '../../infra/db/pg-errors.js';
import { CLOCK } from '../../infra/time/time.module.js';
import { coordKey } from '../settlements/bbox.js';
import {
  type OwnSettlementView,
  ownView,
} from '../settlements/settlement-views.js';
import { SettlementsRepository } from '../settlements/settlements.repository.js';
import { pickHomeIsland } from './home-island-picker.js';
import type { ProfileRow } from './profiles.repository.js';
import { ProfilesRepository } from './profiles.repository.js';
import {
  type WorldListItem,
  type WorldStateView,
  worldListItem,
  worldState,
} from './world-views.js';
import {
  type CreateWorldInput,
  type WorldRow,
  WorldsRepository,
} from './worlds.repository.js';

const JOIN_ATTEMPTS = 3;
const DEFAULT_SETTLEMENT_NAME = 'Osada';

@Injectable()
export class WorldsService {
  constructor(
    private readonly worlds: WorldsRepository,
    private readonly profiles: ProfilesRepository,
    private readonly settlements: SettlementsRepository,
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(playerId: number): Promise<WorldListItem[]> {
    const [rows, joined] = await Promise.all([
      this.worlds.list(),
      this.profiles.worldIdsFor(playerId),
    ]);
    return rows.map((w) => worldListItem(w, joined.has(w.id)));
  }

  state(
    world: WorldRow,
    profile: ProfileRow,
    playerId: number,
  ): WorldStateView {
    return worldState(world, profile, playerId);
  }

  create(input: CreateWorldInput): Promise<WorldRow> {
    if (
      !Number.isInteger(input.seed) ||
      input.seed < 0 ||
      input.seed > 2147483647
    ) {
      throw new RangeError('seed musi być liczbą całkowitą w [0, 2147483647]');
    }
    if (
      !Number.isInteger(input.width) ||
      !Number.isInteger(input.height) ||
      input.width < 1 ||
      input.height < 1
    ) {
      throw new RangeError(
        'width i height muszą być dodatnimi liczbami całkowitymi',
      );
    }
    return this.worlds.create(input);
  }

  /** Zakłada profil i osadę domową w jednej transakcji; powtarza losowanie po konflikcie klucza osady. */
  async join(
    worldId: number,
    playerId: number,
    name?: string,
  ): Promise<OwnSettlementView> {
    const world = await this.worlds.findById(worldId);
    if (!world) {
      throw new NotFoundException('Świat nie istnieje');
    }
    if (world.status !== 'OPEN') {
      throw new ConflictException('Świat nie przyjmuje nowych graczy');
    }
    if (await this.profiles.find(worldId, playerId)) {
      throw new ConflictException('Masz już profil na tym świecie');
    }
    const settlementName = name ?? DEFAULT_SETTLEMENT_NAME;

    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt++) {
      const taken = await this.settlements.listCoords(worldId);
      const pick = pickHomeIsland(
        world,
        (x, y) => taken.has(coordKey(x, y)),
        (n) => randomInt(n),
      );
      if (!pick) {
        throw new ConflictException(
          'Świat jest pełny: brak wolnej wyspy na osadę domową',
        );
      }
      const now = this.clock.now();
      try {
        await this.db.transaction(async (tx) => {
          await this.profiles.create(tx, {
            worldId,
            playerId,
            homeX: pick.x,
            homeY: pick.y,
          });
          await this.settlements.insertWithBuildings(tx, {
            worldId,
            x: pick.x,
            y: pick.y,
            ownerId: playerId,
            name: settlementName,
            biome: pick.biome,
            resources: STARTER_PACK,
            lastSyncAt: now,
            buildings: startingBuildings(pick.biome),
          });
        });
      } catch (err) {
        // Ktoś wziął tę wyspę w międzyczasie — losujemy jeszcze raz. Współrzędne osady
        // chronią DWA ograniczenia unikalne; w praktyce Postgres zgłasza klucz główny, ale
        // to obserwacja, nie gwarancja z dokumentacji, a druga nazwa zamieniłaby wyścig
        // w błąd serwera zamiast w ponowienie.
        if (
          isUniqueViolation(err, 'settlements_pk') ||
          isUniqueViolation(err, 'settlements_world_xy_biome_unique')
        ) {
          continue;
        }
        if (isUniqueViolation(err, 'profiles_pk')) {
          throw new ConflictException('Masz już profil na tym świecie');
        }
        throw err;
      }
      const record = await this.settlements.findOne(worldId, pick.x, pick.y);
      if (!record) {
        throw new Error('Osada domowa zniknęła tuż po założeniu');
      }
      return ownView(record, now);
    }
    throw new ConflictException(
      'Nie udało się wylosować wolnej wyspy, spróbuj ponownie',
    );
  }
}
