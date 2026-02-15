
import { GoogleGenAI, Type } from "@google/genai";
import { OCRResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper: Resize and compress image for API to avoid payload limits
const prepareImageForAPI = async (base64Str: string): Promise<{ data: string, mimeType: string, width: number, height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const MAX_DIM = 1024;
      let w = img.width;
      let h = img.height;

      // Downscale if too large
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

      // Export as JPEG (quality 0.85) to reduce size significantly compared to PNG
      const newDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      const mimeType = 'image/jpeg';
      const data = newDataUrl.split(',')[1];
      resolve({ data, mimeType, width: w, height: h });
    };
    img.onerror = (e) => reject(e);
    // Handle potential data URI prefixes
    img.src = base64Str;
  });
};

export const analyzeTextInImage = async (base64Image: string): Promise<OCRResult> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
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
      model: 'gemini-2.0-flash',
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
    // Detect mime type simple check
    const mimeType = base64Image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/)?.[1] || 'image/png';
    const data = base64Image.split(',')[1];

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data,
            },
          },
          {
            text: "High-fidelity Inpainting Task: Remove the text completely from this image slice. The goal is to recover the background behind the text. \n\nCRITICAL REQUIREMENTS:\n1. Seamlessly blend the inpainted area with the surrounding texture, noise, and gradient.\n2. Do NOT leave any blurry artifacts or solid color blocks. It must look photorealistic.\n3. Do not generate new objects. Just restore the clean background.",
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("AI Inpainting failed", error);
    return null;
  }
};

export const removeAllTextFromSlide = async (base64Image: string): Promise<string | null> => {
  try {
    // 1. Resize and Compress Image for API
    const { data, mimeType, width, height } = await prepareImageForAPI(base64Image);

    // NOTE: For purely editing/inpainting tasks where we want the output to match input size,
    // we should NOT constrain the aspect ratio in config, or the model might try to regenerate
    // the image composition instead of editing it.

    console.log(`[Gemini] Sending image for text removal: ${width}x${height}`);

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: data,
            },
          },
          {
            text: "Image Editing Task: Remove ALL text from this image. Replace the text areas with the surrounding background pattern (inpainting). Keep all other graphics, charts, and layout elements exactly the same. Do not generate a new design. Just clean the text. Return only the image.",
          },
        ],
      },
      // Removed config.imageConfig to allow model to default to input image aspect ratio/size for editing
    });

    console.log("[Gemini] Response received", response);

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    // Fallback: Check for text refusal/error from model
    const textOutput = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (textOutput) {
      console.warn("[Gemini] Model returned text instead of image:", textOutput);
    }

    return null;
  } catch (error) {
    console.error("Full Slide Text Removal failed", error);
    return null;
  }
};
