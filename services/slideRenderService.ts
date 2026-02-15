import { SlideData } from "../types";
import { loadImage } from "./imageUtils";

export const renderSlideToCanvas = async (slide: SlideData): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = slide.width;
  canvas.height = slide.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context initialization failed.");
  }

  const baseImage = await loadImage(slide.dataUrl);
  ctx.drawImage(baseImage, 0, 0, slide.width, slide.height);

  for (const overlay of slide.overlays) {
    if (overlay.type === "image" && overlay.imageSrc) {
      try {
        const overlayImg = await loadImage(overlay.imageSrc);
        ctx.drawImage(overlayImg, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      } catch {
        // Continue rendering other overlays.
      }
      continue;
    }

    if (overlay.backgroundImage) {
      try {
        const bgImg = await loadImage(overlay.backgroundImage);
        ctx.drawImage(bgImg, overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      } catch {
        ctx.fillStyle = overlay.backgroundColor;
        ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
      }
    } else {
      ctx.fillStyle = overlay.backgroundColor;
      ctx.fillRect(overlay.rect.x, overlay.rect.y, overlay.rect.width, overlay.rect.height);
    }

    ctx.fillStyle = overlay.fontColor;
    const fontSize = overlay.fontSize;
    ctx.font = `${overlay.fontWeight} ${fontSize}px ${overlay.fontFamily}, sans-serif`;

    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = `${overlay.letterSpacing || 0}px`;
    }

    const lines = overlay.newText.split("\n");
    const lineHeight = fontSize * 1.2;
    const totalTextHeight = lines.length * lineHeight;
    const yNudge = fontSize * 0.15;

    ctx.textAlign = (overlay.hAlign || "left") as CanvasTextAlign;
    ctx.textBaseline = "top";

    let tx = overlay.rect.x;
    if (overlay.hAlign === "center") tx = overlay.rect.x + overlay.rect.width / 2;
    else if (overlay.hAlign === "right") tx = overlay.rect.x + overlay.rect.width;

    let ty = overlay.rect.y;
    if (overlay.vAlign === "middle") ty = overlay.rect.y + (overlay.rect.height - totalTextHeight) / 2;
    else if (overlay.vAlign === "bottom") ty = overlay.rect.y + overlay.rect.height - totalTextHeight;

    ty += yNudge;
    lines.forEach((line, index) => {
      ctx.fillText(line, tx, ty + index * lineHeight);
    });

    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = "0px";
    }
  }

  return canvas;
};
