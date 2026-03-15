import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface GeologyComponent {
  name: string;
  type: "Igneous" | "Sedimentary" | "Metamorphic" | "Pollen" | "Spore" | "Mineral" | "Other";
  percentage: number;
  description: string;
  labelPosition?: { x: number; y: number }; // Normalized 0-100
}

export interface AnalysisResult {
  summary: string;
  components: GeologyComponent[];
  geologicalContext: string;
}

export async function analyzePhotomicrograph(base64Image: string, mimeType: string): Promise<AnalysisResult> {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `Analyze this geological photomicrograph with scientific precision. 
  Identify all visible minerals, rock types (igneous, sedimentary, metamorphic), pollen, or spores.
  For each identified component, provide:
  1. Scientific name
  2. Category (Igneous, Sedimentary, Metamorphic, Pollen, Spore, Mineral, or Other)
  3. Estimated volumetric percentage (the total should sum to approximately 100%)
  4. A brief scientific description of its appearance and significance in this sample.
  5. Approximate normalized coordinates (x, y from 0 to 100) for a representative grain/feature of this component for labeling.

  Also provide a general summary of the sample and its geological context.`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Image.split(",")[1] || base64Image,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          geologicalContext: { type: Type.STRING },
          components: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING, enum: ["Igneous", "Sedimentary", "Metamorphic", "Pollen", "Spore", "Mineral", "Other"] },
                percentage: { type: Type.NUMBER },
                description: { type: Type.STRING },
                labelPosition: {
                  type: Type.OBJECT,
                  properties: {
                    x: { type: Type.NUMBER },
                    y: { type: Type.NUMBER },
                  },
                  required: ["x", "y"],
                },
              },
              required: ["name", "type", "percentage", "description"],
            },
          },
        },
        required: ["summary", "components", "geologicalContext"],
      },
    },
  });

  try {
    return JSON.parse(response.text || "{}") as AnalysisResult;
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Failed to analyze the image. Please try again.");
  }
}
