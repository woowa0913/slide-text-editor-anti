import { describe, expect, it } from 'vitest';
import { extractConnectedMaskRects } from './utils/eraseMask';

const createMask = (width: number, height: number, points: Array<[number, number]>): Uint8ClampedArray => {
  const mask = new Uint8ClampedArray(width * height);
  points.forEach(([x, y]) => {
    mask[y * width + x] = 255;
  });
  return mask;
};

describe('extractConnectedMaskRects', () => {
  it('extracts multiple connected regions as bounding rects', () => {
    const width = 8;
    const height = 8;
    const mask = createMask(width, height, [
      [1, 1], [2, 1], [1, 2], [2, 2],
      [5, 5], [6, 5], [5, 6], [6, 6],
    ]);

    const rects = extractConnectedMaskRects(mask, width, height, 1);
    expect(rects).toEqual([
      { x: 1, y: 1, width: 2, height: 2 },
      { x: 5, y: 5, width: 2, height: 2 },
    ]);
  });

  it('filters tiny components below minPixels', () => {
    const width = 6;
    const height = 6;
    const mask = createMask(width, height, [
      [0, 0], // tiny component
      [2, 2], [3, 2], [2, 3], [3, 3], // valid component
    ]);

    const rects = extractConnectedMaskRects(mask, width, height, 2);
    expect(rects).toEqual([{ x: 2, y: 2, width: 2, height: 2 }]);
  });
});
