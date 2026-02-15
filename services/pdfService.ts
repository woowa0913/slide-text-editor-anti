
import { SlideData } from '../types';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { renderSlideToCanvas } from './slideRenderService';

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
    const canvas = await renderSlideToCanvas(slide);
    const finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(finalDataUrl, 'JPEG', 0, 0, slide.width, slide.height);
  };
  for (let i = 0; i < slides.length; i++) {
    await processSlide(slides[i], i);
  }
  doc.save(filename);
};
