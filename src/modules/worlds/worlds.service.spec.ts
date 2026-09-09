import { ConflictException } from '@nestjs/common';
import { STARTER_PACK, startingBuildings } from '../../domain/balance/index.js';
import { islandAt } from '../../domain/geography/index.js';
import type { Clock } from '../../domain/time/index.js';
import type { Db } from '../../infra/db/db.module.js';
import type { SettlementRecord } from '../settlements/settlement-views.js';
import type { SettlementsRepository } from '../settlements/settlements.repository.js';
import type { ProfileRow, ProfilesRepository } from './profiles.repository.js';
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

/**
 * Drizzle 0.45 opakowuje `PostgresError` w `DrizzleQueryError` i zostawia oryginał pod `cause`,
 * więc atrapa naśladuje ten sam łańcuch, po którym chodzi `isUniqueViolation`.
 */
function uniqueViolation(constraint: string): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint'),
    { cause: { code: '23505', constraint_name: constraint } },
  );
}

interface JoinFailures {
  /** Błąd rzucany przez wstawienie osady w n-tej próbie; `null` = sukces. */
  settlement?: (Error | null)[];
  /** Błąd rzucany przez wstawienie profilu w n-tej próbie; `null` = sukces. */
  profile?: (Error | null)[];
}

/** Serwis z atrapą transakcji: `join` da się przetestować bez bazy i bez prawdziwego wyścigu. */
function makeJoinService(failures: JoinFailures = {}) {
  const world = {
    id: 7,
    seed: 1337,
    width: 200,
    height: 200,
    status: 'OPEN',
  } as WorldRow;
  const worlds = {
    findById: () => Promise.resolve(world),
  } as unknown as WorldsRepository;

  const profileAttempts: { homeX: number; homeY: number }[] = [];
  const profiles = {
    find: () => Promise.resolve(undefined),
    create: (_client: unknown, input: { homeX: number; homeY: number }) => {
      profileAttempts.push({ homeX: input.homeX, homeY: input.homeY });
      const err = failures.profile?.[profileAttempts.length - 1];
      return err
        ? Promise.reject(err)
        : Promise.resolve({} as unknown as ProfileRow);
    },
  } as unknown as ProfilesRepository;

  const insertAttempts: { x: number; y: number; name: string }[] = [];
  const settlements = {
    listCoords: () => Promise.resolve(new Set<string>()),
    insertWithBuildings: (
      _client: unknown,
      input: { x: number; y: number; name: string },
    ) => {
      insertAttempts.push({ x: input.x, y: input.y, name: input.name });
      const err = failures.settlement?.[insertAttempts.length - 1];
      return err ? Promise.reject(err) : Promise.resolve();
    },
    findOne: (worldId: number, x: number, y: number) =>
      Promise.resolve({
        worldId,
        x,
        y,
        ownerId: 42,
        ownerName: 'gracz',
        name: 'Osada',
        biome: islandAt(world.seed, x, y)!.biome,
        resources: { ...STARTER_PACK },
        population: 0,
        lastSyncAt: new Date('2026-09-08T12:00:00.000Z'),
        buildings: startingBuildings(islandAt(world.seed, x, y)!.biome),
      } satisfies SettlementRecord),
  } as unknown as SettlementsRepository;

  // Atrapa transakcji: uruchamia ciało i przepuszcza jego odrzucenie, tak jak drizzle.
  const db = {
    transaction: (fn: (tx: unknown) => Promise<void>) => fn({}),
  } as unknown as Db;
  const clock: Clock = { now: () => new Date('2026-09-08T12:00:00.000Z') };

  return {
    service: new WorldsService(worlds, profiles, settlements, db, clock),
    insertAttempts,
    profileAttempts,
  };
}

describe('WorldsService.join — ponawianie i klasyfikacja błędów bazy', () => {
  it('po konflikcie settlements_pk losuje jeszcze raz i kończy się sukcesem', async () => {
    const { service, insertAttempts, profileAttempts } = makeJoinService({
      settlement: [uniqueViolation('settlements_pk'), null],
    });
    const view = await service.join(7, 42);
    expect(insertAttempts).toHaveLength(2);
    expect(profileAttempts).toHaveLength(2);
    // Profil i osada z tej samej próby trafiają na te same współrzędne.
    expect(profileAttempts[1]).toEqual({
      homeX: insertAttempts[1].x,
      homeY: insertAttempts[1].y,
    });
    expect(view).toMatchObject({ x: insertAttempts[1].x, world: '7' });
  });

  it('gdy settlements_pk pada za każdym razem, wraca konflikt po wyczerpaniu prób', async () => {
    const always = () =>
      makeJoinService({
        settlement: Array.from({ length: 10 }, () =>
          uniqueViolation('settlements_pk'),
        ),
      });
    const byType = always();
    await expect(byType.service.join(7, 42)).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Pętla ma sufit: trzy próby i koniec, zamiast kręcenia się w nieskończoność.
    expect(byType.insertAttempts).toHaveLength(3);

    const byMessage = always();
    await expect(byMessage.service.join(7, 42)).rejects.toThrow(
      /Nie udało się wylosować wolnej wyspy/,
    );
  });

  it('konflikt profiles_pk to 409 o istniejącym profilu, bez ponawiania', async () => {
    const conflicting = () =>
      makeJoinService({ profile: [uniqueViolation('profiles_pk')] });
    const byType = conflicting();
    await expect(byType.service.join(7, 42)).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Jedna próba: konflikt profilu nie jest wyścigiem o wyspę, więc nie ponawiamy.
    expect(byType.profileAttempts).toHaveLength(1);
    expect(byType.insertAttempts).toHaveLength(0);

    const byMessage = conflicting();
    await expect(byMessage.service.join(7, 42)).rejects.toThrow(
      /Masz już profil na tym świecie/,
    );
  });

  it('błąd niezwiązany z unikalnością leci dalej, a pętla go nie połyka', async () => {
    const boom = Object.assign(new Error('kolumna nie istnieje'), {
      cause: { code: '42703' },
    });
    const { service, insertAttempts } = makeJoinService({
      settlement: [boom],
    });
    await expect(service.join(7, 42)).rejects.toBe(boom);
    expect(insertAttempts).toHaveLength(1);
  });
});
