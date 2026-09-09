import type { Clock } from '../../domain/time/index.js';
import type { Db } from '../../infra/db/db.module.js';
import type { SettlementsRepository } from '../settlements/settlements.repository.js';
import type { ProfilesRepository } from './profiles.repository.js';
import type {
  CreateWorldInput,
  WorldRow,
  WorldsRepository,
} from './worlds.repository.js';
import { WorldsService } from './worlds.service.js';

/** Walidacja wejścia jest czysta i synchroniczna — repozytorium wystarczy atrapa. */
function makeService() {
  const created: CreateWorldInput[] = [];
  const worlds = {
    create(input: CreateWorldInput): Promise<WorldRow> {
      created.push(input);
      return Promise.resolve({
        id: 1,
        createdAt: new Date('2026-09-08T12:00:00.000Z'),
        status: 'OPEN',
        ...input,
      } as WorldRow);
    },
  } as unknown as WorldsRepository;
  const profiles = {} as unknown as ProfilesRepository;
  // `create` nie dotyka osad, bazy ani zegara — atrapy tylko po to, żeby zbudować serwis.
  const settlements = {} as unknown as SettlementsRepository;
  const db = {} as unknown as Db;
  const clock: Clock = { now: () => new Date('2026-09-08T12:00:00.000Z') };
  return {
    service: new WorldsService(worlds, profiles, settlements, db, clock),
    created,
  };
}

const VALID: CreateWorldInput = {
  seed: 1337,
  width: 200,
  height: 200,
  windX: 0.3,
  windY: -0.1,
};

describe('WorldsService.create — walidacja wejścia', () => {
  it('odrzuca NaN w szerokości i w wysokości', () => {
    const { service, created } = makeService();
    // Realna ścieżka: CLI robi Number('abc') i dostaje NaN.
    expect(() => service.create({ ...VALID, width: Number('abc') })).toThrow(
      RangeError,
    );
    expect(() => service.create({ ...VALID, height: Number('abc') })).toThrow(
      /width i height/,
    );
    expect(created).toHaveLength(0);
  });

  it('odrzuca zero, wartości ujemne i ułamkowe wymiary', () => {
    const { service, created } = makeService();
    expect(() => service.create({ ...VALID, width: 0 })).toThrow(RangeError);
    expect(() => service.create({ ...VALID, height: 0 })).toThrow(RangeError);
    expect(() => service.create({ ...VALID, width: -1 })).toThrow(RangeError);
    expect(() => service.create({ ...VALID, height: -1 })).toThrow(RangeError);
    expect(() => service.create({ ...VALID, width: 200.5 })).toThrow(
      RangeError,
    );
    expect(created).toHaveLength(0);
  });

  it('odrzuca ziarno poza zakresem 31 bitów i ziarno nieliczbowe', () => {
    const { service, created } = makeService();
    expect(() => service.create({ ...VALID, seed: -1 })).toThrow(/seed/);
    expect(() => service.create({ ...VALID, seed: 2147483648 })).toThrow(
      /seed/,
    );
    expect(() => service.create({ ...VALID, seed: 1.5 })).toThrow(/seed/);
    expect(() => service.create({ ...VALID, seed: Number('abc') })).toThrow(
      /seed/,
    );
    expect(created).toHaveLength(0);
  });

  it('przepuszcza poprawne wejście do repozytorium', async () => {
    const { service, created } = makeService();
    const world = await service.create(VALID);
    expect(created).toEqual([VALID]);
    expect(world.id).toBe(1);
  });
});
