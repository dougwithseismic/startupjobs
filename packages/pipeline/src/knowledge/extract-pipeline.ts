import { isNull, eq } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { jobListings } from "../db/schema.js";
import type { ExtractedEntities } from "./extract.js";
import { storeExtraction } from "./store.js";
import { stripHtml } from "../sync/content-hash.js";
import { parseLlmJson } from "../llm/ollama-generate.js";
import { openRouterGenerate } from "../llm/openrouter.js";
import { TRANSLATE_EXTRACT_PROMPT_V1 } from "../prompts/translate-extract-v1.js";

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_MODEL = "meta-llama/llama-4-scout";

const EMPTY_ENTITIES: ExtractedEntities = {
  skills: [], technologies: [], languages: [], spokenLanguages: [],
  frameworks: [], tools: [], platforms: [], methodologies: [],
  soft_skills: [], industry: [],
};

interface CombinedResult {
  detectedLanguage: string;
  titleEn: string;
  descriptionEn: string;
  entities: ExtractedEntities;
}

async function translateAndExtract(
  title: string,
  description: string,
  company: string,
  options?: { model?: string },
): Promise<CombinedResult> {
  const cleanDesc = stripHtml(description).slice(0, 4000);
  const prompt = `${TRANSLATE_EXTRACT_PROMPT_V1.prompt}Title: ${title}\nCompany: ${company}\nDescription: ${cleanDesc}`;

  const raw = await openRouterGenerate(prompt, {
    model: options?.model ?? DEFAULT_MODEL,
    maxTokens: 2048,
  });

  const parsed = parseLlmJson<Record<string, unknown>>(raw);
  if (!parsed) {
    return {
      detectedLanguage: "cs",
      titleEn: title,
      descriptionEn: cleanDesc,
      entities: { ...EMPTY_ENTITIES },
    };
  }

  const lang = parsed["detectedLanguage"];
  const detectedLang = typeof lang === "string" && /^[a-z]{2}$/.test(lang) ? lang : "cs";

  const entities = { ...EMPTY_ENTITIES };
  for (const key of Object.keys(EMPTY_ENTITIES) as (keyof ExtractedEntities)[]) {
    const val = parsed[key];
    if (Array.isArray(val)) {
      entities[key] = val
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
  }

  return {
    detectedLanguage: detectedLang,
    titleEn:
      typeof parsed["titleEn"] === "string" ? parsed["titleEn"] : title,
    descriptionEn:
      typeof parsed["descriptionEn"] === "string" ? parsed["descriptionEn"] : cleanDesc,
    entities,
  };
}

async function processJob(
  db: Db,
  job: {
    id: string;
    sourceId: number;
    title: string;
    description: string;
    company: string;
    detectedLanguage: string | null;
    titleEn: string | null;
  },
  options?: { model?: string },
): Promise<{ entityCount: number; translated: boolean }> {
  const result = await translateAndExtract(
    job.title,
    job.description,
    job.company,
    options,
  );

  await db
    .update(jobListings)
    .set({
      detectedLanguage: result.detectedLanguage,
      titleEn: result.titleEn,
      descriptionEn: result.descriptionEn,
    })
    .where(eq(jobListings.id, job.id));

  const entityCount = await storeExtraction(db, job.id, result.entities);

  const entitySummary = Object.entries(result.entities)
    .filter(([, v]) => v.length > 0)
    .map(([k, v]) => `${v.length} ${k}`)
    .join(", ");

  const langTag = result.detectedLanguage !== "en" ? ` [${result.detectedLanguage}→en]` : "";
  console.log(`  ${job.title}${langTag} → ${entitySummary || "no entities"}`);

  return { entityCount, translated: result.detectedLanguage !== "en" };
}

export async function runExtraction(
  db: Db,
  options?: {
    limit?: number;
    model?: string;
    translateModel?: string;
    concurrency?: number;
  },
) {
  const limit = options?.limit ?? 1000;
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;

  const unextracted = await db
    .select({
      id: jobListings.id,
      sourceId: jobListings.sourceId,
      title: jobListings.title,
      description: jobListings.description,
      company: jobListings.company,
      detectedLanguage: jobListings.detectedLanguage,
      titleEn: jobListings.titleEn,
    })
    .from(jobListings)
    .where(isNull(jobListings.extractedAt))
    .limit(limit);

  console.log(`  ${unextracted.length} jobs pending (concurrency: ${concurrency}, model: ${options?.model ?? DEFAULT_MODEL})`);

  let processed = 0;
  let totalEntities = 0;
  let translated = 0;

  for (let i = 0; i < unextracted.length; i += concurrency) {
    const batch = unextracted.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map((job) => processJob(db, job, { model: options?.model })),
    );

    for (const result of results) {
      processed++;
      if (result.status === "fulfilled") {
        totalEntities += result.value.entityCount;
        if (result.value.translated) translated++;
      } else {
        console.error(`  FAILED: ${result.reason}`);
      }
    }

    console.log(`  Progress: ${processed}/${unextracted.length}`);
  }

  console.log(
    `\nExtraction complete: ${processed} jobs, ${translated} translated, ${totalEntities} entity relations`,
  );
}
