import { stripHtml } from "../sync/content-hash.js";
import { EXTRACTION_PROMPT_V1 } from "../prompts/extraction-v1.js";
import { ollamaGenerate, parseLlmJson } from "../llm/ollama-generate.js";

export interface ExtractedEntities {
  skills: string[];
  technologies: string[];
  languages: string[];
  spokenLanguages: string[];
  frameworks: string[];
  tools: string[];
  platforms: string[];
  methodologies: string[];
  soft_skills: string[];
  industry: string[];
}

const EMPTY: ExtractedEntities = {
  skills: [],
  technologies: [],
  languages: [],
  spokenLanguages: [],
  frameworks: [],
  tools: [],
  platforms: [],
  methodologies: [],
  soft_skills: [],
  industry: [],
};

export async function extractEntities(
  title: string,
  description: string,
  company: string,
  options?: { baseUrl?: string; model?: string },
): Promise<ExtractedEntities> {
  const cleanDesc = stripHtml(description).slice(0, 4000);
  const prompt = `${EXTRACTION_PROMPT_V1.prompt}Title: ${title}\nCompany: ${company}\nDescription: ${cleanDesc}`;

  const raw = await ollamaGenerate(prompt, {
    model: options?.model ?? EXTRACTION_PROMPT_V1.model,
    baseUrl: options?.baseUrl,
  });

  const parsed = parseLlmJson<Record<string, unknown>>(raw);
  if (!parsed) return { ...EMPTY };

  const result = { ...EMPTY };
  for (const key of Object.keys(EMPTY) as (keyof ExtractedEntities)[]) {
    const val = parsed[key];
    if (Array.isArray(val)) {
      result[key] = val
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
  }
  return result;
}
