
import { OCRResult } from "../types";
type GeminiAction =
  | "analyzeTextInImage"
  | "generateTextSuggestion"
  | "removeTextFromImage"
  | "removeAllTextFromSlide";

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
    return await callGeminiApi<string | null>("removeAllTextFromSlide", { base64Image });
  } catch (error: any) {
    console.error("Full Slide Text Removal failed:", error);
    throw error;
  }
};
