import { BIOMES, BUILDINGS } from '@islanders/domain/rules';
import { biomeType, buildingType, missionType, worldStatus } from './enums.js';

describe('enumy Postgresa odpowiadają regułom domenowym', () => {
  it('biome_type i building_type', () => {
    expect(biomeType.enumValues).toEqual([...BIOMES]);
    expect(buildingType.enumValues).toEqual([...BUILDINGS]);
  });
  it('world_status i mission_type ze słownika', () => {
    expect(worldStatus.enumValues).toEqual(['DRAFT', 'OPEN', 'CLOSED', 'ENDED']);
    expect(missionType.enumValues).toEqual([
      'COLONIZE',
      'ATTACK',
      'TRANSPORT',
      'EXPEDITION',
      'RETURN',
    ]);
  });
});
