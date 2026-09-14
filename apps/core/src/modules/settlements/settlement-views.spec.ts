import {
  ownView,
  publicView,
  viewFor,
  type SettlementRecord,
} from './settlement-views.js';

const OWNER = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';

const record: SettlementRecord = {
  x: 80,
  y: 73,
  ownerId: OWNER,
  ownerName: 'sebastian',
  name: 'Koralowa',
  biome: 'TROPICAL',
  resources: { wood: 500, stone: 200, food: 1000, iron: 40, sulfur: 0 },
  population: 0,
  lastSyncAt: new Date('2026-09-08T12:00:00.000Z'),
  buildings: { TOWN_HALL: 1, WAREHOUSE: 1, SAWMILL: 1, FARM: 1 },
};
const now = new Date('2026-09-08T13:00:00.000Z');

describe('publicView', () => {
  it('ma wyłącznie dane publiczne i nie ma klucza resources', () => {
    const view = publicView(record, 'world-1');
    expect(view).toEqual({
      world: 'world-1',
      x: 80,
      y: 73,
      ownerId: OWNER,
      ownerName: 'sebastian',
      name: 'Koralowa',
    });
    expect('resources' in view).toBe(false);
    expect(Object.keys(view).sort()).toEqual([
      'name',
      'ownerId',
      'ownerName',
      'world',
      'x',
      'y',
    ]);
  });
});

describe('ownView', () => {
  it('kształt z sekcji 4.2 specu klienta, zasoby zmaterializowane na now, sześć slotów', () => {
    const view = ownView(record, 'world-1', now);
    expect(view).toEqual({
      world: 'world-1',
      x: 80,
      y: 73,
      ownerId: OWNER,
      ownerName: 'sebastian',
      name: 'Koralowa',
      resources: { wood: 560, stone: 200, food: 1080, iron: 40, sulfur: 0 },
      productionPerHour: { wood: 60, stone: 0, food: 80, iron: 0, sulfur: 0 },
      capacity: 2000,
      population: 0,
      populationMax: 100,
      buildings: {
        TOWN_HALL: 1,
        BARRACKS: 0,
        SHIPYARD: 0,
        WAREHOUSE: 1,
        SAWMILL: 1,
        FARM: 1,
      },
      lastSyncAt: '2026-09-08T13:00:00.000Z',
    });
  });

  it('obcina zasoby do pojemności', () => {
    const later = new Date('2026-09-10T12:00:00.000Z');
    expect(ownView(record, 'world-1', later).resources.wood).toBe(2000);
  });
});

describe('viewFor', () => {
  it('właściciel dostaje ownView, każdy inny publicView', () => {
    expect('resources' in viewFor(record, 'world-1', OWNER, now)).toBe(true);
    expect('resources' in viewFor(record, 'world-1', OTHER, now)).toBe(false);
  });
});
