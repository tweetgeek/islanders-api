import { BadRequestException } from '@nestjs/common';

export interface Bbox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Klient przy zoomie 0.25 widzi ok. 17×30 komórek; 64×64 daje zapas bez otwierania całej mapy. */
export const MAX_BBOX_CELLS = 4096;

export function coordKey(x: number, y: number): string {
  return `${x}:${y}`;
}

/** `bbox=x1,y1,x2,y2` — domknięty, w granicach mapy, o powierzchni ≤ MAX_BBOX_CELLS. */
export function parseBbox(
  raw: string,
  world: { width: number; height: number },
): Bbox {
  const parts = raw.split(',');
  if (parts.length !== 4 || parts.some((p) => !/^-?\d+$/.test(p.trim()))) {
    throw new BadRequestException(
      'bbox musi mieć postać x1,y1,x2,y2 z liczbami całkowitymi',
    );
  }
  const [ax, ay, bx, by] = parts.map((p) => Number(p.trim()));
  const box: Bbox = {
    x1: Math.min(ax, bx),
    y1: Math.min(ay, by),
    x2: Math.max(ax, bx),
    y2: Math.max(ay, by),
  };
  if (
    box.x1 < 0 ||
    box.y1 < 0 ||
    box.x2 >= world.width ||
    box.y2 >= world.height
  ) {
    throw new BadRequestException(
      `bbox poza mapą ${world.width}x${world.height}`,
    );
  }
  const cells = (box.x2 - box.x1 + 1) * (box.y2 - box.y1 + 1);
  if (cells > MAX_BBOX_CELLS) {
    throw new BadRequestException(
      `bbox obejmuje ${cells} komórek, maksimum ${MAX_BBOX_CELLS}`,
    );
  }
  return box;
}
