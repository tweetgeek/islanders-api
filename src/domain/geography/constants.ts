/**
 * Stałe kontraktu geografii (ADR 0001 klienta, załącznik; api-guidelines sekcja 4).
 * Zmiana którejkolwiek zmienia geografię każdego otwartego świata — to migracja świata, nie redeploy.
 * Test parity porównuje je z blokiem `constants` w contract/world-parity.json.
 */
export const LAND_FREQUENCY = 0.12;
export const LAND_THRESHOLD = 0.3;
export const BIOME_FREQUENCY = 0.03;
export const BIOME_BAND = 0.15;
export const DEPOSIT_CHANCE = 0.3;
export const RADIUS_MIN = 60.0;
export const RADIUS_MAX = 110.0;
export const OCTAVE_SALT = 1013;
/** Kolejność iteracji przy losowaniu znaleziska — część kontraktu (ResourceTypes.ALL u klienta). */
export const RESOURCE_ORDER = [
  'wood',
  'stone',
  'food',
  'iron',
  'sulfur',
] as const;
export type ResourceName = (typeof RESOURCE_ORDER)[number];
