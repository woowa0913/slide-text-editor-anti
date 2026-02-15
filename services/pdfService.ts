
import { SlideData } from '../types';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { loadImage } from './imageUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export const convertPdfToImages = async (file: File): Promise<SlideData[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const slides: SlideData[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Increased scale from 2.0 to 3.0 for higher resolution
    const viewport = page.getViewport({ scale: 3.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create canvas context for PDF rendering.');
    }
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;
    
    slides.push({
      index: i - 1,
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
      overlays: []
    });
  }

  return slides;
};

export const downloadAsPdf = async (slides: SlideData[], filename: string): Promise<void> => {
  const doc = new jsPDF({
    orientation: slides[0].width > slides[0].height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [slides[0].width, slides[0].height]
  });

  const processSlide = async (slide: SlideData, idx: number) => {
    if (idx > 0) doc.addPage([slide.width, slide.height]);
    
    const canvas = document.createElement('canvas');
    canvas.width = slide.width;
    canvas.height = slide.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create canvas context for PDF export.');
    }
    
    const img = await loadImage(slide.dataUrl);
    
    ctx.drawImage(img, 0, 0);

    // Process overlays sequentially
    for (const overlay of slide.overlays) {
      if (overlay.type === 'image' && overlay.imageSrc) {
        // Draw Image Overlay
        try {
          const overlayImg = await loadImage(overlay.imageSrc);
          ctx.drawImage(overlayImg, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
        } catch {
          // Keep export running even when a single overlay image fails.
        }
      } else {
        // Draw Text Overlay
        
        // Draw background: AI Image or Solid Color
        if (overlay.backgroundImage) {
          try {
            const bgImg = await loadImage(overlay.backgroundImage);
            ctx.drawImage(bgImg, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
          } catch {
            // Fallback to color fill when background image fails to load.
            ctx.fillStyle = overlay.backgroundColor;
            ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
          }
        } else {
          ctx.fillStyle = overlay.backgroundColor;
          ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
        }
        
        // Draw Text
        ctx.fillStyle = overlay.fontColor;
        const fSize = overlay.fontSize;
        ctx.font = `${overlay.fontWeight} ${fSize}px ${overlay.fontFamily}, sans-serif`;
        
        if (ctx.letterSpacing !== undefined) {
          ctx.letterSpacing = `${overlay.letterSpacing || 0}px`;
        }

        const lines = overlay.newText.split('\n');
        const lineHeight = fSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        
        // Apply same visual nudge as EditorCanvas
        const yNudge = fSize * 0.15;

        ctx.textAlign = (overlay.hAlign || 'left') as CanvasTextAlign;
        ctx.textBaseline = 'top';

        let tx = overlay.rect.x;
        if (overlay.hAlign === 'center') tx = overlay.rect.x + overlay.rect.width / 2;
        else if (overlay.hAlign === 'right') tx = overlay.rect.x + overlay.rect.width;

        let ty = overlay.rect.y;
        if (overlay.vAlign === 'middle') ty = overlay.rect.y + (overlay.rect.height - totalTextHeight) / 2;
        else if (overlay.vAlign === 'bottom') ty = overlay.rect.y + overlay.rect.height - totalTextHeight;

        // Apply Nudge
        ty += yNudge;

        lines.forEach((line, index) => {
          ctx.fillText(line, tx, ty + index * lineHeight);
        });
        
        if (ctx.letterSpacing !== undefined) {
          ctx.letterSpacing = '0px';
        }
      }
    }
    
    const finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(finalDataUrl, 'JPEG', 0, 0, slide.width, slide.height);
  };
  for (let i = 0; i < slides.length; i++) {
    await processSlide(slides[i], i);
  }
  doc.save(filename);
};
