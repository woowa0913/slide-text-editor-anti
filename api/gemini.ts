import { GoogleGenAI, Modality, Type } from "@google/genai";

const IMAGE_GEN_MODEL = "gemini-2.5-flash-image";
const TEXT_MODEL = "gemini-2.0-flash";

type Action =
  | "analyzeTextInImage"
  | "generateTextSuggestion"
  | "removeTextFromImage"
  | "removeAllTextFromSlide";

const parseInlineData = (base64Image: string, fallbackMimeType = "image/png") => {
  const mimeMatch = base64Image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  const mimeType = mimeMatch?.[1] || fallbackMimeType;
  const data = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;
  return { mimeType, data };
};

const extractImageDataUrl = (response: any): string | null => {
  for (const part of response?.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData?.data) {
      const responseMime = part.inlineData.mimeType || "image/png";
      return `data:${responseMime};base64,${part.inlineData.data}`;
    }
  }
  return null;
};

const getAiClient = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing API key. Set API_KEY or GEMINI_API_KEY in deployment environment.");
  }
  return new GoogleGenAI({ apiKey });
};

const analyzeTextInImage = async (ai: GoogleGenAI, base64Image: string) => {
  const { data, mimeType } = parseInlineData(base64Image, "image/png");
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data,
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
          }`,
        },
      ],
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
        required: ["text", "fontSize", "fontWeight", "fontColor", "fontFamily", "backgroundColor"],
      },
    },
  });

  const parsed = JSON.parse(response.text || "{}");
  return {
    text: parsed.text || "",
    fontSize: parsed.fontSize || 16,
    fontWeight: parsed.fontWeight || "normal",
    fontColor: parsed.fontColor || "#000000",
    fontFamily: parsed.fontFamily || "sans-serif",
    backgroundColor: parsed.backgroundColor || "#ffffff",
  };
};

const generateTextSuggestion = async (ai: GoogleGenAI, originalText: string) => {
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
};

const removeText = async (ai: GoogleGenAI, base64Image: string) => {
  const { data, mimeType } = parseInlineData(base64Image);
  const response = await ai.models.generateContent({
    model: IMAGE_GEN_MODEL,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data,
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

  const imageDataUrl = extractImageDataUrl(response);
  if (imageDataUrl) return imageDataUrl;

  const textOutput = response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (textOutput) {
    throw new Error(`Model returned text instead of image: ${String(textOutput).slice(0, 120)}`);
  }

  throw new Error("No image data in model response.");
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { action, payload } = req.body as { action?: Action; payload?: Record<string, unknown> };
    if (!action || !payload) {
      res.status(400).json({ error: "Missing action or payload" });
      return;
    }

    const ai = getAiClient();

    if (action === "analyzeTextInImage") {
      const base64Image = String(payload.base64Image || "");
      const data = await analyzeTextInImage(ai, base64Image);
      res.status(200).json({ data });
      return;
    }

    if (action === "generateTextSuggestion") {
      const originalText = String(payload.originalText || "");
      const data = await generateTextSuggestion(ai, originalText);
      res.status(200).json({ data });
      return;
    }

    if (action === "removeTextFromImage" || action === "removeAllTextFromSlide") {
      const base64Image = String(payload.base64Image || "");
      const data = await removeText(ai, base64Image);
      res.status(200).json({ data });
      return;
    }

    res.status(400).json({ error: "Unsupported action" });
  } catch (error: any) {
    const message = error?.message || "Unknown server error";
    res.status(500).json({ error: message });
  }
}
