import { ConflictException } from '@nestjs/common';
import { STARTER_PACK, startingBuildings } from '@islanders/domain/balance';
import type { Clock } from '@islanders/domain/time';
import { islandAt } from '../../domain/geography/index.js';
import type { Db } from '../../infra/db/db.module.js';
import type { WorldSettingsRepository, WorldSettingsRow } from '../../world/world-settings.repository.js';
import type { OutboxRepository } from '../../outbox/outbox.repository.js';
import type { ProfileRow, ProfilesRepository } from '../profiles/profiles.repository.js';
import type { SettlementRecord } from '../settlements/settlement-views.js';
import type { SettlementsRepository } from '../settlements/settlements.repository.js';
import { JoinService } from './join.service.js';

const PLAYER = { id: '00000000-0000-4000-8000-000000000042', roles: ['player' as const], nickname: 'gracz' };
const world = {
  id: 1, slug: 'world-7', name: 'Świat 7', status: 'OPEN', isTest: false,
  seed: 1337, width: 200, height: 200, windX: 0, windY: 0,
  createdAt: new Date(0), updatedAt: new Date(0),
} as WorldSettingsRow;

/**
 * Drizzle 0.45 opakowuje `PostgresError` w `DrizzleQueryError` i zostawia oryginał pod `cause`,
 * więc atrapa naśladuje ten sam łańcuch, po którym chodzi `isUniqueViolation`.
 */
function uniqueViolation(constraint: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    cause: { code: '23505', constraint_name: constraint },
  });
}

function makeJoinService(
  failures: { settlement?: (Error | null)[]; profile?: (Error | null)[] } = {},
  worldStatusOnShare: WorldSettingsRow['status'] = 'OPEN',
) {
  const worlds = {
    findForShare: () => Promise.resolve({ ...world, status: worldStatusOnShare }),
  } as unknown as WorldSettingsRepository;

  const profileAttempts: { homeX: number; homeY: number }[] = [];
  const profiles = {
    find: () => Promise.resolve(undefined),
    create: (_client: unknown, input: { homeX: number; homeY: number }) => {
      profileAttempts.push({ homeX: input.homeX, homeY: input.homeY });
      const err = failures.profile?.[profileAttempts.length - 1];
      return err ? Promise.reject(err) : Promise.resolve({} as ProfileRow);
    },
  } as unknown as ProfilesRepository;

  const insertAttempts: { x: number; y: number }[] = [];
  const settlements = {
    listCoords: () => Promise.resolve(new Set<string>()),
    insertWithBuildings: (_client: unknown, input: { x: number; y: number }) => {
      insertAttempts.push({ x: input.x, y: input.y });
      const err = failures.settlement?.[insertAttempts.length - 1];
      return err ? Promise.reject(err) : Promise.resolve();
    },
    findOne: (x: number, y: number) =>
      Promise.resolve({
        x, y, ownerId: PLAYER.id, ownerName: 'gracz', name: 'Osada',
        biome: islandAt(world.seed, x, y)!.biome,
        resources: { ...STARTER_PACK }, population: 0,
        lastSyncAt: new Date('2026-09-14T12:00:00.000Z'),
        buildings: startingBuildings(islandAt(world.seed, x, y)!.biome),
      } satisfies SettlementRecord),
  } as unknown as SettlementsRepository;

  const events: unknown[] = [];
  const outbox = { add: (_client: unknown, event: unknown) => (events.push(event), Promise.resolve()) } as unknown as OutboxRepository;

  // Atrapa transakcji: uruchamia ciało i przepuszcza jego odrzucenie, tak jak drizzle.
  const db = { transaction: (fn: (tx: unknown) => Promise<void>) => fn({}) } as unknown as Db;
  const clock: Clock = { now: () => new Date('2026-09-14T12:00:00.000Z') };
  return {
    service: new JoinService(worlds, profiles, settlements, outbox, db, clock),
    insertAttempts,
    profileAttempts,
    events,
  };
}

describe('JoinService.join — ponawianie i klasyfikacja błędów bazy', () => {
  it('po konflikcie settlements_pk losuje jeszcze raz i kończy się sukcesem', async () => {
    const { service, insertAttempts, profileAttempts, events } = makeJoinService({
      settlement: [uniqueViolation('settlements_pk'), null],
    });
    const view = await service.join(world, PLAYER);
    expect(insertAttempts).toHaveLength(2);
    expect(profileAttempts[1]).toEqual({ homeX: insertAttempts[1].x, homeY: insertAttempts[1].y });
    expect(view).toMatchObject({ x: insertAttempts[1].x, world: 'world-7', ownerId: PLAYER.id });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'PlayerJoinedWorld', worldSlug: 'world-7', playerId: PLAYER.id });
  });

  it('gdy settlements_pk pada za każdym razem, wraca 409 po trzech próbach', async () => {
    const { service, insertAttempts } = makeJoinService({
      settlement: Array.from({ length: 10 }, () => uniqueViolation('settlements_pk')),
    });
    await expect(service.join(world, PLAYER)).rejects.toThrow(/Nie udało się wylosować wolnej wyspy/);
    expect(insertAttempts).toHaveLength(3);
  });

  it('konflikt profiles_pkey to 409 o istniejącym profilu, bez ponawiania', async () => {
    const { service, profileAttempts, insertAttempts } = makeJoinService({
      profile: [uniqueViolation('profiles_pkey')],
    });
    await expect(service.join(world, PLAYER)).rejects.toThrow(/Masz już profil na tym świecie/);
    expect(profileAttempts).toHaveLength(1);
    expect(insertAttempts).toHaveLength(0);
  });

  it('świat inny niż OPEN -> 409 bez dotykania bazy', async () => {
    const { service, profileAttempts } = makeJoinService();
    await expect(service.join({ ...world, status: 'CLOSED' }, PLAYER)).rejects.toBeInstanceOf(ConflictException);
    expect(profileAttempts).toHaveLength(0);
  });

  it('świat zmienił status na CLOSED tuż po nieblokowanym odczycie -> 409 z blokady FOR SHARE, bez wstawiania profilu', async () => {
    const { service, profileAttempts, insertAttempts } = makeJoinService({}, 'CLOSED');
    await expect(service.join(world, PLAYER)).rejects.toThrow(/Świat nie przyjmuje nowych graczy/);
    expect(profileAttempts).toHaveLength(0);
    expect(insertAttempts).toHaveLength(0);
  });

  it('błąd niezwiązany z unikalnością leci dalej, a pętla go nie połyka', async () => {
    const boom = Object.assign(new Error('kolumna nie istnieje'), { cause: { code: '42703' } });
    const { service, insertAttempts } = makeJoinService({ settlement: [boom] });
    await expect(service.join(world, PLAYER)).rejects.toBe(boom);
    expect(insertAttempts).toHaveLength(1);
  });
});
