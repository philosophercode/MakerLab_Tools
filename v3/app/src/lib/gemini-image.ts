const GEMINI_MODEL = "gemini-3-pro-image-preview";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiImageResult {
  imageBase64: string;
  mimeType: string;
  text?: string;
}

export async function generateImage(
  prompt: string,
): Promise<GeminiImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: "You are a product photography image generator. CRITICAL RULE: The COMPLETE object must be fully visible in frame with generous padding on ALL sides — top, bottom, left, right. Never crop or cut off ANY edge of the object. Zoom out enough that there is empty background space surrounding the entire item. Use a slightly elevated 3/4 angle so the full 3D shape is clear. The object should occupy roughly 60% of the frame, centered.",
        }],
      },
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error("Gemini returned no content");
  }

  let imageBase64 = "";
  let mimeType = "image/png";
  let text: string | undefined;

  for (const part of parts) {
    if (part.inlineData) {
      imageBase64 = part.inlineData.data;
      mimeType = part.inlineData.mimeType || "image/png";
    } else if (part.text) {
      text = part.text;
    }
  }

  if (!imageBase64) {
    throw new Error("Gemini returned no image data");
  }

  return { imageBase64, mimeType, text };
}
