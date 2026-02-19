import { describe, expect, it } from 'vitest';
import { duplicateSlideAtIndex } from './utils/slideOperations';
import { SlideData } from './types';

const createSlide = (index: number, name: string): SlideData => ({
  index,
  dataUrl: `data:image/png;base64,${name}`,
  width: 100,
  height: 100,
  overlays: [
    {
      id: `${name}-overlay`,
      type: 'text',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      originalText: 'a',
      newText: 'b',
      fontSize: 12,
      fontWeight: 'normal',
      fontColor: '#000',
      fontFamily: 'Inter',
      backgroundColor: '#fff',
      vAlign: 'top',
      hAlign: 'left',
    },
  ],
});

describe('duplicateSlideAtIndex', () => {
  it('duplicates slide right after source index and returns inserted index', () => {
    const slides = [createSlide(0, 's0'), createSlide(1, 's1')];
    const result = duplicateSlideAtIndex(slides, 0);
    expect(result.insertedIndex).toBe(1);
    expect(result.slides).toHaveLength(3);
    expect(result.slides[1].dataUrl).toBe(slides[0].dataUrl);
    expect(result.slides[1]).not.toBe(slides[0]);
    expect(result.slides[1].overlays[0]).not.toBe(slides[0].overlays[0]);
  });
});
