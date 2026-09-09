import { Injectable } from '@nestjs/common';
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

@Injectable()
export class WorldsService {
  constructor(
    private readonly worlds: WorldsRepository,
    private readonly profiles: ProfilesRepository,
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
}
