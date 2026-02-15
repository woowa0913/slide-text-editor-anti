import PptxGenJS from "pptxgenjs";
import { SlideData } from "../types";
import { renderSlideToCanvas } from "./slideRenderService";

const PX_PER_INCH = 96;

export const downloadAsPpt = async (slides: SlideData[], filename: string): Promise<void> => {
  if (slides.length === 0) return;

  const pptx = new PptxGenJS();
  const baseWidthIn = slides[0].width / PX_PER_INCH;
  const baseHeightIn = slides[0].height / PX_PER_INCH;

  pptx.defineLayout({
    name: "CUSTOM",
    width: baseWidthIn,
    height: baseHeightIn,
  });
  pptx.layout = "CUSTOM";

  for (const slide of slides) {
    const pptSlide = pptx.addSlide();
    const canvas = await renderSlideToCanvas(slide);
    const imageDataUrl = canvas.toDataURL("image/png");
    pptSlide.addImage({
      data: imageDataUrl,
      x: 0,
      y: 0,
      w: baseWidthIn,
      h: baseHeightIn,
    });
  }

  await pptx.writeFile({ fileName: filename });
};
