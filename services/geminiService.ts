
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { OCRResult } from "../types";

const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error("[Gemini] ⚠️ API_KEY가 설정되지 않았습니다. .env 파일 또는 Vercel 환경변수를 확인하세요.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

// Image generation model - verified available via ListModels API
const IMAGE_GEN_MODEL = 'gemini-2.5-flash-image';
const TEXT_MODEL = 'gemini-2.0-flash';

// Helper: Resize and compress image for API to avoid payload limits
const prepareImageForAPI = async (base64Str: string): Promise<{ data: string, mimeType: string, width: number, height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const MAX_DIM = 1024;
      let w = img.width;
      let h = img.height;

      if (w > MAX_DIM || h > MAX_DIM) {
        const scale = Math.min(MAX_DIM / w, MAX_DIM / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error("Canvas context failed")); return; }

      ctx.drawImage(img, 0, 0, w, h);

      const newDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const mimeType = 'image/jpeg';
      const data = newDataUrl.split(',')[1];
      resolve({ data, mimeType, width: w, height: h });
    };
    img.onerror = (e) => reject(e);
    img.src = base64Str;
  });
};

export const analyzeTextInImage = async (base64Image: string): Promise<OCRResult> => {
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Image.split(',')[1],
          },
        },
        {
          text: `Analyze this image snippet.
          
          TASK 1: Extract the exact text.
          TASK 2: Measure the CSS styles to replicate the text appearance.
          
          CRITICAL FOR FONT SIZE: 
          - Measure the pixel height of the uppercase letters in the image. 
          - Return that EXACT number as 'fontSize'. 
          - Do not underestimate. If the text fills the height of the image, the fontSize should be equal to the image height.
          - Example: If the image is 50px high and text fills it, fontSize is 50.

          Return JSON:
          {
            "text": "content",
            "fontSize": number,
            "fontWeight": "normal" | "bold",
            "fontColor": "#hex",
            "fontFamily": "font name",
            "backgroundColor": "#hex"
          }`
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          fontSize: { type: Type.NUMBER },
          fontWeight: { type: Type.STRING },
          fontColor: { type: Type.STRING },
          fontFamily: { type: Type.STRING },
          backgroundColor: { type: Type.STRING },
        },
        required: ["text", "fontSize", "fontWeight", "fontColor", "fontFamily", "backgroundColor"]
      }
    }
  });

  try {
    const data = JSON.parse(response.text || "{}");
    return {
      text: data.text || "",
      fontSize: data.fontSize || 16,
      fontWeight: data.fontWeight || "normal",
      fontColor: data.fontColor || "#000000",
      fontFamily: data.fontFamily || "sans-serif",
      backgroundColor: data.backgroundColor || "#ffffff"
    };
  } catch (error) {
    console.error("Failed to parse Gemini response", error);
    return {
      text: "OCR Error",
      fontSize: 16,
      fontWeight: "normal",
      fontColor: "#000000",
      fontFamily: "sans-serif",
      backgroundColor: "#ffffff"
    };
  }
};

export const generateTextSuggestion = async (originalText: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: `Context: A user is editing a slide presentation.
      Task: Rewrite the following text to be more professional, concise, or natural.
      If it is a sentence fragment, complete it logically. 
      If it is Korean, keep it in Korean.
      
      Original Text: "${originalText}"
      
      Return ONLY the suggested text string.`,
    });
    return response.text?.trim() || originalText;
  } catch (error) {
    console.error("AI Suggestion failed", error);
    return originalText;
  }
};

export const removeTextFromImage = async (base64Image: string): Promise<string | null> => {
  try {
    const mimeType = base64Image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || 'image/png';
    const data = base64Image.split(',')[1];

    console.log(`[Gemini] removeTextFromImage: sending request with model ${IMAGE_GEN_MODEL}...`);

    const response = await ai.models.generateContent({
      model: IMAGE_GEN_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data,
            },
          },
          {
            text: "Remove all text from this image. Fill the text areas with the surrounding background pattern (inpainting). Keep everything else the same. Return only the edited image.",
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    console.log("[Gemini] removeTextFromImage: response received");

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const responseMime = part.inlineData.mimeType || 'image/png';
        return `data:${responseMime};base64,${part.inlineData.data}`;
      }
    }

    const textOutput = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textOutput) {
      console.warn("[Gemini] Model returned text instead of image:", textOutput);
      throw new Error(`모델이 이미지 대신 텍스트를 반환했습니다: ${textOutput.substring(0, 100)}`);
    }

    throw new Error("모델 응답에 이미지 데이터가 없습니다.");
  } catch (error: any) {
    console.error("AI Inpainting failed:", error);
    throw error; // Re-throw to let caller handle with detailed message
  }
};

export const removeAllTextFromSlide = async (base64Image: string): Promise<string | null> => {
  try {
    const { data, mimeType, width, height } = await prepareImageForAPI(base64Image);

    console.log(`[Gemini] Sending full slide for text removal: ${width}x${height}, model: ${IMAGE_GEN_MODEL}`);

    const response = await ai.models.generateContent({
      model: IMAGE_GEN_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data,
            },
          },
          {
            text: "Remove ALL text from this image. Replace the text areas with the surrounding background pattern (inpainting). Keep all other graphics, charts, and layout elements exactly the same. Do not generate a new design. Just clean the text. Return only the image.",
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    console.log("[Gemini] Response received");

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const responseMime = part.inlineData.mimeType || 'image/png';
        return `data:${responseMime};base64,${part.inlineData.data}`;
      }
    }

    const textOutput = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textOutput) {
      console.warn("[Gemini] Model returned text instead of image:", textOutput);
      throw new Error(`모델이 이미지 대신 텍스트를 반환했습니다: ${textOutput.substring(0, 100)}`);
    }

    throw new Error("모델 응답에 이미지 데이터가 없습니다.");
  } catch (error: any) {
    console.error("Full Slide Text Removal failed:", error);
    throw error; // Re-throw to let caller handle with detailed message
  }
};
