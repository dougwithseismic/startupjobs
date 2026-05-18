import { TRANSLATION_PROMPT_V1 } from "../prompts/translation-v1.js";
import { ollamaGenerate, parseLlmJson } from "../llm/ollama-generate.js";
import { stripHtml } from "../sync/content-hash.js";

export interface TranslationResult {
  detectedLanguage: "cs" | "en" | "mixed";
  titleEn: string;
  descriptionEn: string;
}

export async function translateListing(
  title: string,
  description: string,
  options?: { baseUrl?: string; model?: string },
): Promise<TranslationResult> {
  const cleanDesc = stripHtml(description).slice(0, 3000);
  const prompt = `${TRANSLATION_PROMPT_V1.prompt}Title: ${title}\nDescription: ${cleanDesc}`;

  const raw = await ollamaGenerate(prompt, {
    model: options?.model ?? TRANSLATION_PROMPT_V1.model,
    baseUrl: options?.baseUrl,
    maxTokens: 2048,
  });

  const parsed = parseLlmJson<Record<string, unknown>>(raw);
  if (!parsed) {
    return { detectedLanguage: "cs", titleEn: title, descriptionEn: cleanDesc };
  }

  const lang = parsed["detectedLanguage"];
  return {
    detectedLanguage:
      lang === "cs" || lang === "en" || lang === "mixed" ? lang : "cs",
    titleEn:
      typeof parsed["titleEn"] === "string" ? parsed["titleEn"] : title,
    descriptionEn:
      typeof parsed["descriptionEn"] === "string"
        ? parsed["descriptionEn"]
        : cleanDesc,
  };
}
