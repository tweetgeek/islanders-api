import {
  capacityFor,
  populationMaxFor,
  productionPerHour,
} from '../../domain/balance/index.js';
import { currentResources } from '../../domain/economy/index.js';
import {
  type Biome,
  type BuildingLevels,
  type Resources,
  slotsFor,
} from '../../domain/rules/index.js';

export interface SettlementRecord {
  worldId: number;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  name: string;
  biome: Biome;
  resources: Resources;
  population: number;
  lastSyncAt: Date;
  buildings: BuildingLevels;
}

/** Public Data ze słownika: to, co każdy widzi o każdej osadzie. BEZ klucza `resources`. */
export interface PublicSettlementView {
  world: string;
  x: number;
  y: number;
  ownerId: number;
  ownerName: string;
  name: string;
}

export interface OwnSettlementView extends PublicSettlementView {
  resources: Resources;
  productionPerHour: Resources;
  capacity: number;
  population: number;
  populationMax: number;
  buildings: Record<string, number>;
  lastSyncAt: string;
}

export function publicView(s: SettlementRecord): PublicSettlementView {
  return {
    world: String(s.worldId),
    x: s.x,
    y: s.y,
    ownerId: s.ownerId,
    ownerName: s.ownerName,
    name: s.name,
  };
}

/** Zasoby zmaterializowane leniwie na `now` bez zapisu; `lastSyncAt = now`, żeby klient ekstrapolował od tej chwili. */
export function ownView(s: SettlementRecord, now: Date): OwnSettlementView {
  const rate = productionPerHour(s.biome, s.buildings);
  const capacity = capacityFor(s.buildings);
  return {
    ...publicView(s),
    resources: currentResources(s.resources, rate, s.lastSyncAt, now, capacity),
    productionPerHour: rate,
    capacity,
    population: s.population,
    populationMax: populationMaxFor(s.buildings),
    buildings: Object.fromEntries(
      slotsFor(s.biome).map((slot) => [slot, s.buildings[slot] ?? 0]),
    ),
    lastSyncAt: now.toISOString(),
  };
}

/** Jedyne miejsce decydujące, kto co widzi. */
export function viewFor(
  s: SettlementRecord,
  requesterId: number,
  now: Date,
): PublicSettlementView | OwnSettlementView {
  return s.ownerId === requesterId ? ownView(s, now) : publicView(s);
}
