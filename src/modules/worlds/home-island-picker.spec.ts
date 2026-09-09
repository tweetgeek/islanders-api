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

  it('nie wybiera wyspy wulkanicznej, nawet gdy jest jedyną wolną komórką', () => {
    // Zajmujemy wszystko poza wulkanami, więc picker MUSI ocenić komórki wulkaniczne.
    // Bez strażnika po biomie oddałby wulkan; z nim nie ma żadnej kandydatki.
    const volcanicOnly = (x: number, y: number) => {
      const island = islandAt(world.seed, x, y);
      return !(island && island.biome === 'VOLCANIC');
    };
    let volcanic = 0;
    for (let x = 0; x < world.width; x++) {
      for (let y = 0; y < world.height; y++) {
        const island = islandAt(world.seed, x, y);
        if (island && island.biome === 'VOLCANIC') volcanic++;
      }
    }
    expect(volcanic).toBeGreaterThan(0); // test nie jest pusty: wulkany na tej mapie są
    expect(pickHomeIsland(world, volcanicOnly, first)).toBeNull();
  });

  it('nie ocenia komórek spoza mapy, choć geografia zwraca tam prawdziwy ląd', () => {
    // Wąski i wysoki świat: pierścienie wokół środka szybko wychodzą poza mapę
    // (ujemne x oraz y >= height). Strażnik granic jest nośny, nie obronny —
    // islandAt poza mapą oddaje normalną wyspę, więc bez niego picker zwróciłby
    // współrzędne, pod którymi nie da się założyć osady.
    const strip = { seed: 1337, width: 3, height: 200 };
    expect(islandAt(strip.seed, -5, -5)).not.toBeNull();
    const insideTaken = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < strip.width && y < strip.height;
    expect(pickHomeIsland(strip, insideTaken, first)).toBeNull();
  });
});
