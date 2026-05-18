import "./env.js";

import { isNull } from "drizzle-orm";
import { createDb } from "../db/connection.js";
import { jobListings } from "../db/schema.js";
import { stripHtml } from "../sync/content-hash.js";
import { openRouterGenerate } from "../llm/openrouter.js";
import { parseLlmJson } from "../llm/ollama-generate.js";
import { buildTaxonomyPromptBlock } from "../knowledge/taxonomy.js";

const MODELS = [
  "google/gemini-2.0-flash-001",
  "deepseek/deepseek-chat-v3-0324",
  "meta-llama/llama-4-scout",
];

const taxonomyBlock = buildTaxonomyPromptBlock();
const systemPrompt = `Analyze this job listing. Return JSON only, no markdown.

TASK 1 — Detect language (ISO 639-1), translate title to English, summarize description in 1-3 English sentences.

TASK 2 — Extract entities. ONLY pick items from the valid lists below. Empty array if nothing matches.

${taxonomyBlock}

For skills and soft_skills: extract free-text but ONLY skills actually stated in the listing.
For industry: extract the business domain from context.

RULES:
- ONLY extract what is EXPLICITLY mentioned in the listing text
- If an item is not in the valid lists above, do NOT include it
- A non-technical role must have empty languages/frameworks/technologies arrays
- spokenLanguages: use ISO codes from the list above

{"detectedLanguage":"","titleEn":"","descriptionEn":"","skills":[],"technologies":[],"languages":[],"spokenLanguages":[],"frameworks":[],"tools":[],"platforms":[],"methodologies":[],"soft_skills":[],"industry":[]}`;

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

for (const model of MODELS) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`MODEL: ${model}`);
  console.log(`${"=".repeat(60)}\n`);

  const times: number[] = [];
  let parsed = 0;
  let totalEntities = 0;
  let totalHallucinations = 0;

  for (let i = 0; i < sample.length; i++) {
    const job = sample[i]!;
    const cleanDesc = stripHtml(job.description).slice(0, 4000);
    const fullPrompt = `${systemPrompt}\n\nJob listing:\nTitle: ${job.title}\nCompany: ${job.company}\nDescription: ${cleanDesc}`;

    const start = performance.now();
    try {
      const raw = await openRouterGenerate(fullPrompt, {
        model,
        maxTokens: 2048,
      });
      const elapsed = performance.now() - start;
      times.push(elapsed);

      const result = parseLlmJson<Record<string, unknown>>(raw);
      if (result) {
        parsed++;
        const srcText = (job.title + " " + job.description).toLowerCase();
        let hallucinations = 0;

        const constrained = ["technologies", "languages", "frameworks", "tools", "platforms", "methodologies"] as const;
        for (const k of constrained) {
          const vals = result[k] as string[];
          if (vals?.length) {
            totalEntities += vals.length;
            for (const v of vals) {
              if (!srcText.includes(v.toLowerCase())) hallucinations++;
            }
          }
        }
        const skills = result["skills"] as string[] ?? [];
        totalEntities += skills.length;

        const lang = result["detectedLanguage"] ?? "?";
        const spoken = result["spokenLanguages"] as string[] ?? [];
        totalHallucinations += hallucinations;

        console.log(
          `  [${i + 1}] ${(elapsed / 1000).toFixed(1)}s | lang=${lang} spoken=[${spoken}] | ${hallucinations} hallucinations | ${job.title.slice(0, 50)}`,
        );
      } else {
        console.log(`  [${i + 1}] ${(elapsed / 1000).toFixed(1)}s | PARSE FAIL | ${job.title.slice(0, 50)}`);
      }
    } catch (err) {
      const elapsed = performance.now() - start;
      times.push(elapsed);
      console.log(`  [${i + 1}] ${(elapsed / 1000).toFixed(1)}s | ERROR: ${err} | ${job.title.slice(0, 50)}`);
    }
  }

  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : 0;
  const total = times.reduce((a, b) => a + b, 0) / 1000;
  console.log(`\n  --- ${model} ---`);
  console.log(`  Avg: ${avg.toFixed(1)}s | Total: ${total.toFixed(1)}s | Parsed: ${parsed}/5`);
  console.log(`  Entities: ${totalEntities} | Hallucinations: ${totalHallucinations}`);
  console.log(`  Est. 468 jobs: ${((avg * 468) / 60).toFixed(1)} min sequential, ${((avg * 468) / 5 / 60).toFixed(1)} min @5 concurrent`);
}

process.exit(0);
