
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type HorizontalAlign = 'left' | 'center' | 'right';

export interface TextOverlay {
  id: string;
  type?: 'text' | 'image'; // Default is 'text'
  rect: Rect;
  originalText: string;
  newText: string;
  fontSize: number;
  fontWeight: string;
  fontColor: string;
  fontFamily: string;
  backgroundColor: string;
  backgroundImage?: string; // AI generated background for text
  imageSrc?: string; // User uploaded image for image overlays
  vAlign: VerticalAlign;
  hAlign: HorizontalAlign;
  letterSpacing?: number;
  // New properties for transformation
  rotation?: number; // Degrees
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}

export interface SlideData {
  index: number;
  dataUrl: string;
  width: number;
  height: number;
  overlays: TextOverlay[];
}

export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

export interface OCRResult {
  text: string;
  fontSize: number;
  fontWeight: string;
  fontColor: string;
  fontFamily: string;
  backgroundColor: string;
}
