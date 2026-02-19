import { SlideData, TextOverlay } from '../types';

const cloneOverlay = (overlay: TextOverlay): TextOverlay => ({
  ...overlay,
  rect: { ...overlay.rect },
});

const cloneSlide = (slide: SlideData): SlideData => ({
  ...slide,
  overlays: slide.overlays.map(cloneOverlay),
});

export const duplicateSlideAtIndex = (
  slides: SlideData[],
  sourceIndex: number
): { slides: SlideData[]; insertedIndex: number } => {
  const source = slides[sourceIndex];
  if (!source) {
    return { slides: [...slides], insertedIndex: sourceIndex };
  }

  const insertedIndex = sourceIndex + 1;
  const duplicated = cloneSlide(source);
  const newSlides = [...slides];
  newSlides.splice(insertedIndex, 0, duplicated);
  return { slides: newSlides, insertedIndex };
};
