import { GoogleGenAI, Type } from "@google/genai";

const MODEL = "gemini-flash-latest";

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    matchedCodeId: {
      type: Type.INTEGER,
      description: "The id of the single best matching candidate code.",
    },
    summary: {
      type: Type.STRING,
      description:
        "A short plain English explanation of the likely issue for the customer.",
    },
  },
  required: ["matchedCodeId", "summary"],
};

function buildPrompt(description, candidates) {
  const list = candidates
    .map(
      (candidate) =>
        `id: ${candidate.id}\ncode: ${candidate.code}\ndescription: ${candidate.description}\nsystem: ${candidate.system}\ncommon causes: ${candidate.common_causes}`
    )
    .join("\n\n");

  return `A customer at a car repair shop described a problem with their vehicle in their own words.

Customer description:
${description}

Candidate diagnostic trouble codes:

${list}

Choose the single candidate that best matches the customer's description and return its id as matchedCodeId. The id must be one of the ids listed above.

Then write a summary of two or three sentences explaining the likely issue in plain English, the way you would explain it to the car owner standing at the counter, not to a mechanic. Avoid jargon and code numbers, describe what is probably happening with their car and why it causes the symptom they described. Do not promise a specific price or a guaranteed fix, and do not invent symptoms the customer did not mention.`;
}

export async function matchWithGemini(description, candidates) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(description, candidates),
    config: {
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const parsed = JSON.parse(response.text);

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof parsed.summary !== "string" ||
    !parsed.summary.trim()
  ) {
    throw new Error("Gemini returned an unusable response");
  }

  return {
    matchedCodeId: Number(parsed.matchedCodeId),
    summary: parsed.summary.trim(),
  };
}
