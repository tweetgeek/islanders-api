import { currentResources } from './current-resources.js';

const stored = { wood: 100, stone: 50, food: 1000, iron: 0, sulfur: 0 };
const rate = { wood: 60, stone: 0, food: 80, iron: 0, sulfur: 0 };
const t0 = new Date('2026-09-08T12:00:00.000Z');

describe('currentResources — ta sama formuła co Settlement.current_resources u klienta', () => {
  it('0 h: bez zmian', () => {
    expect(currentResources(stored, rate, t0, t0, 8000)).toEqual(stored);
  });

  it('2 h: stored + rate * 2', () => {
    const now = new Date(t0.getTime() + 2 * 3600_000);
    expect(currentResources(stored, rate, t0, now, 8000)).toEqual({
      wood: 220,
      stone: 50,
      food: 1160,
      iron: 0,
      sulfur: 0,
    });
  });

  it('obcina do pojemności osobno dla każdego zasobu', () => {
    const now = new Date(t0.getTime() + 100 * 3600_000);
    const out = currentResources(stored, rate, t0, now, 2000);
    expect(out.wood).toBe(2000);
    expect(out.food).toBe(2000);
    expect(out.stone).toBe(50);
  });

  it('ujemna delta czasu nie cofa zasobów', () => {
    const earlier = new Date(t0.getTime() - 3600_000);
    expect(currentResources(stored, rate, t0, earlier, 8000)).toEqual(stored);
  });

  it('ułamki godzin i brak produkcji', () => {
    const now = new Date(t0.getTime() + 30 * 60_000);
    expect(currentResources(stored, rate, t0, now, 8000).wood).toBe(130);
    expect(
      currentResources(stored, { ...rate, wood: 0 }, t0, now, 8000).wood,
    ).toBe(100);
  });

  it('nie schodzi poniżej zera przy ujemnym stanie', () => {
    expect(
      currentResources({ ...stored, iron: -5 }, rate, t0, t0, 8000).iron,
    ).toBe(0);
  });
});
