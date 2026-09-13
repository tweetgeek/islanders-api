import { BIOMES, RESOURCES, biomeResources } from '@islanders/domain/rules';
import { RESOURCE_ORDER } from './constants.js';
import { BIOME_RESOURCES } from './island.js';

/** Geografia zostaje w core do etapu 3, więc zgodność z regułami pilnuje test po stronie core. */
describe('geografia a reguły domenowe', () => {
  it('RESOURCES ma kolejność kontraktu geografii', () => {
    expect([...RESOURCES]).toEqual([...RESOURCE_ORDER]);
  });

  it('geografia i reguły opisują ten sam podział zasobów między biomy', () => {
    for (const b of BIOMES) {
      expect([...biomeResources(b)].sort()).toEqual(
        [...BIOME_RESOURCES[b]].sort(),
      );
    }
  });
});
