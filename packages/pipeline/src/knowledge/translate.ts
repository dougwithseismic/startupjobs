import { TRANSLATION_PROMPT_V1 } from "../prompts/translation-v1.js";

interface OllamaGenerateResponse {
  response: string;
}

export interface TranslationResult {
  detectedLanguage: "cs" | "en" | "mixed";
  titleEn: string;
  descriptionEn: string;
}

const TRANSLATE_PROMPT = `You are a translation and language detection system. Analyze the job listing below.

1. Detect the language: "cs" (Czech), "en" (English), or "mixed"
2. If Czech or mixed, translate the title and description to English
3. If already English, return them unchanged

Return ONLY valid JSON (no markdown, no code fences):
{"detectedLanguage":"cs","titleEn":"English title here","descriptionEn":"English description here"}

Keep the translation natural and professional. Preserve technical terms (React, Python, etc.) as-is.

Job listing:
`;

export async function translateListing(
  title: string,
  description: string,
  options?: { baseUrl?: string; model?: string },
): Promise<TranslationResult> {
  const baseUrl =
    options?.baseUrl ??
    process.env["OLLAMA_BASE_URL"] ??
    "http://localhost:11434";
  const model = options?.model ?? TRANSLATION_PROMPT_V1.model;

  const cleanDesc = description
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);

  const prompt = `${TRANSLATION_PROMPT_V1.prompt}Title: ${title}\nDescription: ${cleanDesc}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 2048 },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama translate failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  return parseTranslation(data.response, title, cleanDesc);
}

function parseTranslation(
  text: string,
  originalTitle: string,
  originalDesc: string,
): TranslationResult {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return {
      detectedLanguage: detectSimple(originalTitle + " " + originalDesc),
      titleEn: originalTitle,
      descriptionEn: originalDesc,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const lang = parsed["detectedLanguage"];
    return {
      detectedLanguage:
        lang === "cs" || lang === "en" || lang === "mixed"
          ? lang
          : detectSimple(originalTitle),
      titleEn:
        typeof parsed["titleEn"] === "string"
          ? parsed["titleEn"]
          : originalTitle,
      descriptionEn:
        typeof parsed["descriptionEn"] === "string"
          ? parsed["descriptionEn"]
          : originalDesc,
    };
  } catch {
    return {
      detectedLanguage: detectSimple(originalTitle),
      titleEn: originalTitle,
      descriptionEn: originalDesc,
    };
  }
}

function detectSimple(text: string): "cs" | "en" | "mixed" {
  const czechChars = /[áčďéěíňóřšťúůýž]/i;
  const czechWords =
    /\b(pro|jako|nebo|hledáme|nabídka|práce|vývojář|programátor|tým|firma)\b/i;

  const hasCzech = czechChars.test(text) || czechWords.test(text);
  const hasEnglish = /\b(developer|engineer|manager|looking|experience|team|work)\b/i.test(text);

  if (hasCzech && hasEnglish) return "mixed";
  if (hasCzech) return "cs";
  return "en";
}
