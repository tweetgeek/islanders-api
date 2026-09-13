import { BadRequestException } from '@nestjs/common';
import { MAX_BBOX_CELLS, parseBbox } from './bbox.js';

const world = { width: 200, height: 200 };

describe('parseBbox', () => {
  it('parsuje i normalizuje kolejność rogów', () => {
    expect(parseBbox('10,20,5,7', world)).toEqual({
      x1: 5,
      y1: 7,
      x2: 10,
      y2: 20,
    });
    expect(parseBbox('0,0,63,63', world)).toEqual({
      x1: 0,
      y1: 0,
      x2: 63,
      y2: 63,
    });
  });

  it('odrzuca zły format, ułamki, poza mapą i zbyt duży prostokąt', () => {
    for (const bad of [
      '1,2,3',
      'a,b,c,d',
      '1.5,2,3,4',
      '-1,0,5,5',
      '0,0,200,5',
      '0,0,64,63',
      '',
    ]) {
      expect(() => parseBbox(bad, world), bad).toThrow(BadRequestException);
    }
    expect(MAX_BBOX_CELLS).toBe(4096);
  });
});
