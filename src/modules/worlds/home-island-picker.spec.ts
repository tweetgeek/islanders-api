import { islandAt } from '../../domain/geography/index.js';
import { pickHomeIsland, ringCells } from './home-island-picker.js';

const world = { seed: 1337, width: 200, height: 200 };
const never = () => false;
const first = () => 0;

describe('ringCells', () => {
  it('r = 0 to sam środek, r = 1 to 8 komórek, r = 2 to 16', () => {
    expect([...ringCells(5, 5, 0)]).toEqual([[5, 5]]);
    expect([...ringCells(5, 5, 1)]).toHaveLength(8);
    expect([...ringCells(5, 5, 2)]).toHaveLength(16);
    for (const [x, y] of ringCells(5, 5, 2))
      expect(Math.max(Math.abs(x - 5), Math.abs(y - 5))).toBe(2);
  });
});

describe('pickHomeIsland', () => {
  it('zwraca wolną wyspę TROPICAL lub TEMPERATE, która według islandAt jest lądem', () => {
    const pick = pickHomeIsland(world, never, first);
    expect(pick).not.toBeNull();
    const island = islandAt(world.seed, pick!.x, pick!.y);
    expect(island).not.toBeNull();
    expect(['TROPICAL', 'TEMPERATE']).toContain(pick!.biome);
    expect(pick!.biome).toBe(island!.biome);
  });

  it('wybiera z najbliższego środka pierścienia z kandydatką; zajęte komórki pomija', () => {
    const a = pickHomeIsland(world, never, first)!;
    const ringA = Math.max(Math.abs(a.x - 100), Math.abs(a.y - 100));
    const b = pickHomeIsland(world, (x, y) => x === a.x && y === a.y, first)!;
    expect(b).not.toEqual(a);
    expect(
      Math.max(Math.abs(b.x - 100), Math.abs(b.y - 100)),
    ).toBeGreaterThanOrEqual(ringA);
  });

  it('używa randomInt do wyboru w obrębie pierścienia', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const p = pickHomeIsland(world, never, (n) => i % n)!;
      seen.add(`${p.x}:${p.y}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it('nie wychodzi poza mapę i zwraca null, gdy wszystko zajęte', () => {
    const small = { seed: 1337, width: 6, height: 6 };
    const p = pickHomeIsland(small, never, first);
    if (p) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(6);
      expect(p.y).toBeLessThan(6);
    }
    expect(pickHomeIsland(small, () => true, first)).toBeNull();
  });
});
