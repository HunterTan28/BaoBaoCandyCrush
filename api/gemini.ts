
import { GoogleGenAI } from "@google/genai";

// Standard proxy for more control over Gemini API calls
// The API key is obtained exclusively from process.env.API_KEY
export async function geminiProxy(params: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: params.model || 'gemini-3-flash-preview',
    contents: params.contents,
    config: {
      temperature: params.temperature,
      responseMimeType: params.responseMimeType,
      responseSchema: params.responseSchema,
    }
  });
  return response;
}

// Helper for simple text generation used by components
export async function generateGameContent(prompt: string, isJson: boolean = false) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.8,
        responseMimeType: isJson ? "application/json" : "text/plain",
      },
    });
    // Access the .text property directly as per guidelines
    return response.text || "";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "";
  }
}