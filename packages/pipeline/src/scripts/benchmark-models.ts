import "./env.js";

import { isNull, eq } from "drizzle-orm";
import { createDb } from "../db/connection.js";
import { jobListings } from "../db/schema.js";
import { stripHtml } from "../sync/content-hash.js";
import { ollamaGenerate, parseLlmJson } from "../llm/ollama-generate.js";
import { TRANSLATE_EXTRACT_PROMPT_V1 } from "../prompts/translate-extract-v1.js";

const SAMPLE_SIZE = 10;
const MODELS = ["qwen3.5:4b", "gemma3:4b", "gemma4"];

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
  .limit(SAMPLE_SIZE);

console.log(`Benchmarking ${MODELS.length} models on ${sample.length} jobs\n`);

for (const model of MODELS) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`MODEL: ${model}`);
  console.log(`${"=".repeat(60)}\n`);

  // Warm up — first call loads model into VRAM
  console.log("  Warming up...");
  await ollamaGenerate("Say hello", { model, maxTokens: 10 });

  const times: number[] = [];
  let totalEntities = 0;
  let parsed = 0;
  let failed = 0;

  for (let i = 0; i < sample.length; i++) {
    const job = sample[i]!;
    const cleanDesc = stripHtml(job.description).slice(0, 4000);
    const prompt = `${TRANSLATE_EXTRACT_PROMPT_V1.prompt}Title: ${job.title}\nCompany: ${job.company}\nDescription: ${cleanDesc}`;

    const start = performance.now();
    try {
      const raw = await ollamaGenerate(prompt, { model, maxTokens: 2048 });
      const elapsed = performance.now() - start;
      times.push(elapsed);

      const result = parseLlmJson<Record<string, unknown>>(raw);
      if (result) {
        parsed++;
        const entityCount = Object.values(result)
          .filter(Array.isArray)
          .reduce((sum, arr) => sum + arr.length, 0);
        totalEntities += entityCount;

        const lang = result["detectedLanguage"] ?? "?";
        const spokenLangs = Array.isArray(result["spokenLanguages"])
          ? result["spokenLanguages"].join(",")
          : "-";

        console.log(
          `  [${i + 1}/${sample.length}] ${(elapsed / 1000).toFixed(1)}s | lang=${lang} spoken=[${spokenLangs}] | ${entityCount} entities | ${job.title.slice(0, 50)}`,
        );
      } else {
        failed++;
        console.log(
          `  [${i + 1}/${sample.length}] ${(elapsed / 1000).toFixed(1)}s | PARSE FAIL | ${job.title.slice(0, 50)}`,
        );
      }
    } catch (err) {
      const elapsed = performance.now() - start;
      times.push(elapsed);
      failed++;
      console.log(
        `  [${i + 1}/${sample.length}] ${(elapsed / 1000).toFixed(1)}s | ERROR: ${err} | ${job.title.slice(0, 50)}`,
      );
    }
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length / 1000;
  const min = Math.min(...times) / 1000;
  const max = Math.max(...times) / 1000;
  const total = times.reduce((a, b) => a + b, 0) / 1000;

  console.log(`\n  --- ${model} RESULTS ---`);
  console.log(`  Total time:    ${total.toFixed(1)}s`);
  console.log(`  Avg per job:   ${avg.toFixed(1)}s`);
  console.log(`  Min/Max:       ${min.toFixed(1)}s / ${max.toFixed(1)}s`);
  console.log(`  Parse success: ${parsed}/${sample.length}`);
  console.log(`  Parse failed:  ${failed}/${sample.length}`);
  console.log(`  Total entities: ${totalEntities}`);
  console.log(`  Avg entities:  ${(totalEntities / Math.max(parsed, 1)).toFixed(1)}`);
  console.log(`  Est. full run (${468} jobs): ${((avg * 468) / 60).toFixed(1)} min sequential, ${((avg * 468) / 5 / 60).toFixed(1)} min @5 concurrent`);
}

console.log("\n\nDone.");
process.exit(0);
