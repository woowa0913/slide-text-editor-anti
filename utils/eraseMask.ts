import { Rect } from '../types';

export const extractConnectedMaskRects = (
  mask: Uint8ClampedArray,
  width: number,
  height: number,
  minPixels: number = 80
): Rect[] => {
  if (mask.length !== width * height) return [];

  const visited = new Uint8Array(mask.length);
  const rects: Rect[] = [];
  const queue: number[] = [];

  const pushIfValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx] || mask[idx] === 0) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let idx = 0; idx < mask.length; idx++) {
    if (visited[idx] || mask[idx] === 0) continue;

    visited[idx] = 1;
    queue.length = 0;
    queue.push(idx);

    let count = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) break;

      const x = current % width;
      const y = Math.floor(current / width);
      count += 1;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      pushIfValid(x - 1, y);
      pushIfValid(x + 1, y);
      pushIfValid(x, y - 1);
      pushIfValid(x, y + 1);
    }

    if (count >= minPixels) {
      rects.push({
        x: minX,
        y: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }

  return rects.sort((a, b) => (a.y - b.y) || (a.x - b.x));
};
