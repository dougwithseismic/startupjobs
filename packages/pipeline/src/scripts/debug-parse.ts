import "./env.js";

import { isNull } from "drizzle-orm";
import { createDb } from "../db/connection.js";
import { jobListings } from "../db/schema.js";
import { stripHtml } from "../sync/content-hash.js";
import { ollamaGenerate, parseLlmJson } from "../llm/ollama-generate.js";
import { TRANSLATE_EXTRACT_PROMPT_V1 } from "../prompts/translate-extract-v1.js";

const db = createDb();

const sample = await db
  .select({
    id: jobListings.id,
    title: jobListings.title,
    description: jobListings.description,
    company: jobListings.company,
  })
  .from(jobListings)
  .where(isNull(jobListings.extractedAt))
  .limit(5);

const MODEL = process.argv.includes("--gemma4") ? "gemma4" : process.argv.includes("--gemma3") ? "gemma3:4b" : "gemma4";
console.log(`Model: ${MODEL}\n`);

for (const job of sample) {
  const cleanDesc = stripHtml(job.description).slice(0, 4000);
  const prompt = `${TRANSLATE_EXTRACT_PROMPT_V1.prompt}Title: ${job.title}\nCompany: ${job.company}\nDescription: ${cleanDesc}`;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`JOB: ${job.title}`);
  console.log(`${"=".repeat(60)}`);

  const raw = await ollamaGenerate(prompt, { model: MODEL, maxTokens: 4096 });

  console.log(`\nRAW length: ${raw.length} chars`);
  console.log("Ends with closing brace:", raw.trimEnd().endsWith("}"));

  const parsed = parseLlmJson<Record<string, unknown>>(raw);
  console.log("PARSED:", parsed ? "OK" : "FAILED");

  if (parsed) {
    const desc = parsed["descriptionEn"] as string;
    console.log(`descriptionEn length: ${desc?.length ?? 0} chars`);
    const langs = parsed["languages"] as string[];
    const spoken = parsed["spokenLanguages"] as string[];
    console.log(`languages (programming): ${JSON.stringify(langs)}`);
    console.log(`spokenLanguages (human): ${JSON.stringify(spoken)}`);

    // Check for hallucination: are "languages" actually in the source text?
    const srcText = (job.title + " " + job.description).toLowerCase();
    for (const lang of langs ?? []) {
      const found = srcText.includes(lang.toLowerCase());
      if (!found) console.log(`  ⚠ HALLUCINATED language: "${lang}" not found in source text`);
    }

    const keys = ["skills","technologies","frameworks","tools","platforms","methodologies"] as const;
    for (const k of keys) {
      const vals = parsed[k] as string[];
      if (vals?.length) {
        for (const v of vals) {
          const found = srcText.includes(v.toLowerCase());
          if (!found) console.log(`  ⚠ HALLUCINATED ${k}: "${v}" not found in source text`);
        }
      }
    }
  } else {
    console.log("RAW tail:", raw.slice(-200));
  }
}

process.exit(0);
