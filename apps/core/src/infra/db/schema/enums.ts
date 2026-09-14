import { pgEnum } from 'drizzle-orm/pg-core';
import { WORLD_STATUSES } from '@islanders/contracts';

export const worldStatus = pgEnum('world_status', WORLD_STATUSES);
export const biomeType = pgEnum('biome_type', [
  'TROPICAL',
  'TEMPERATE',
  'VOLCANIC',
]);
export const buildingType = pgEnum('building_type', [
  'TOWN_HALL',
  'BARRACKS',
  'SHIPYARD',
  'WAREHOUSE',
  'SAWMILL',
  'QUARRY',
  'FARM',
  'IRON_MINE',
  'SULFUR_PIT',
]);
export const missionType = pgEnum('mission_type', [
  'COLONIZE',
  'ATTACK',
  'TRANSPORT',
  'EXPEDITION',
  'RETURN',
]);
