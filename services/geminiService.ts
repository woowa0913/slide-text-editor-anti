
import { OCRResult } from "../types";
type GeminiAction =
  | "analyzeTextInImage"
  | "generateTextSuggestion"
  | "removeTextFromImage"
  | "removeAllTextFromSlide";

const prepareImageForApi = async (base64Image: string): Promise<string> => {
  const MAX_DIM = 1024;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image loading failed for preprocessing."));
    image.src = base64Image;
  });

  let width = img.width;
  let height = img.height;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = Math.min(MAX_DIM / width, MAX_DIM / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context failed for image preprocessing.");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.85);
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
    const resizedImage = await prepareImageForApi(base64Image);
    return await callGeminiApi<string | null>("removeAllTextFromSlide", { base64Image: resizedImage });
  } catch (error: any) {
    console.error("Full Slide Text Removal failed:", error);
    throw error;
  }
};
