import {
  capacityFor,
  populationMaxFor,
  productionPerHour,
} from '@islanders/domain/balance';
import { currentResources } from '@islanders/domain/economy';
import {
  type Biome,
  type BuildingLevels,
  type Resources,
  slotsFor,
} from '@islanders/domain/rules';

export interface SettlementRecord {
  x: number;
  y: number;
  ownerId: string;
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
  /** Slug świata. */
  world: string;
  x: number;
  y: number;
  ownerId: string;
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

export function publicView(s: SettlementRecord, worldSlug: string): PublicSettlementView {
  return { world: worldSlug, x: s.x, y: s.y, ownerId: s.ownerId, ownerName: s.ownerName, name: s.name };
}

/** Zasoby zmaterializowane leniwie na `now` bez zapisu; `lastSyncAt = now`, żeby klient ekstrapolował od tej chwili. */
export function ownView(s: SettlementRecord, worldSlug: string, now: Date): OwnSettlementView {
  const rate = productionPerHour(s.biome, s.buildings);
  const capacity = capacityFor(s.buildings);
  return {
    ...publicView(s, worldSlug),
    resources: currentResources(s.resources, rate, s.lastSyncAt, now, capacity),
    productionPerHour: rate,
    capacity,
    population: s.population,
    populationMax: populationMaxFor(s.buildings),
    buildings: Object.fromEntries(slotsFor(s.biome).map((slot) => [slot, s.buildings[slot] ?? 0])),
    lastSyncAt: now.toISOString(),
  };
}

/** Jedyne miejsce decydujące, kto co widzi. */
export function viewFor(
  s: SettlementRecord,
  worldSlug: string,
  requesterId: string,
  now: Date,
): PublicSettlementView | OwnSettlementView {
  return s.ownerId === requesterId ? ownView(s, worldSlug, now) : publicView(s, worldSlug);
}
