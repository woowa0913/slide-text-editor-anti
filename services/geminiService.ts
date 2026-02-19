
import { OCRResult } from "../types";
type GeminiAction =
  | "analyzeTextInImage"
  | "generateTextSuggestion"
  | "removeTextFromImage"
  | "removeAllTextFromSlide";

const MAX_REQUEST_IMAGE_BYTES = 3_000_000;

const estimateBase64Bytes = (dataUrl: string): number => {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Math.floor((base64.length * 3) / 4);
};

const loadDataUrlImage = (dataUrl: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for compression."));
    img.src = dataUrl;
  });
};

const compressDataUrl = async (
  sourceDataUrl: string,
  scale: number,
  quality: number
): Promise<string> => {
  const img = await loadDataUrlImage(sourceDataUrl);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context failed during compression.");

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
};

const shrinkForRequestIfNeeded = async (dataUrl: string): Promise<string> => {
  if (estimateBase64Bytes(dataUrl) <= MAX_REQUEST_IMAGE_BYTES) {
    return dataUrl;
  }

  let scale = 0.9;
  let quality = 0.9;
  let current = dataUrl;

  for (let i = 0; i < 6; i++) {
    current = await compressDataUrl(current, scale, quality);
    if (estimateBase64Bytes(current) <= MAX_REQUEST_IMAGE_BYTES) {
      return current;
    }
    scale = Math.max(0.7, scale - 0.07);
    quality = Math.max(0.68, quality - 0.05);
  }

  return current;
};

const callGeminiApi = async <T>(action: GeminiAction, payload: Record<string, unknown>): Promise<T> => {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, payload }),
  });

  let body: any = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(body?.error || `Gemini request failed (${response.status})`);
  }

  return body.data as T;
};

export const analyzeTextInImage = async (base64Image: string): Promise<OCRResult> => {
  return callGeminiApi<OCRResult>("analyzeTextInImage", { base64Image });
};

export const generateTextSuggestion = async (originalText: string): Promise<string> => {
  try {
    return await callGeminiApi<string>("generateTextSuggestion", { originalText });
  } catch (error) {
    console.error("AI Suggestion failed", error);
    return originalText;
  }
};

export const removeTextFromImage = async (base64Image: string): Promise<string | null> => {
  try {
    return await callGeminiApi<string | null>("removeTextFromImage", { base64Image });
  } catch (error: any) {
    console.error("AI Inpainting failed:", error);
    throw error;
  }
};

export const removeAllTextFromSlide = async (base64Image: string): Promise<string | null> => {
  try {
    const preparedImage = await shrinkForRequestIfNeeded(base64Image);
    return await callGeminiApi<string | null>("removeAllTextFromSlide", { base64Image: preparedImage });
  } catch (error: any) {
    if (String(error?.message || "").includes("413")) {
      const emergencyImage = await compressDataUrl(base64Image, 0.65, 0.7);
      return await callGeminiApi<string | null>("removeAllTextFromSlide", { base64Image: emergencyImage });
    }
    console.error("Full Slide Text Removal failed:", error);
    throw error;
  }
};
