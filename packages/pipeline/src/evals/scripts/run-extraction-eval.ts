import "../../scripts/env.js";

import { sql } from "drizzle-orm";
import { createDb } from "../../db/connection.js";
import { extractEntities } from "../../knowledge/extract.js";
import { extractionAccuracyScorer } from "../scorers/extraction-accuracy.js";
import { stripHtml } from "../../sync/content-hash.js";

const db = createDb();

const sampleJobs = await db.execute(sql`
  SELECT jl.source_id, jl.title, jl.description, jl.company, jl.title_en, jl.description_en,
    (SELECT json_object_agg(e.type, names) FROM (
      SELECT e.type, json_agg(e.name) as names
      FROM job_entities je JOIN entities e ON e.id = je.entity_id
      WHERE je.job_id = jl.id
      GROUP BY e.type
    ) sub) as stored_entities
  FROM job_listings jl
  WHERE jl.extracted_at IS NOT NULL
  ORDER BY random()
  LIMIT 10
`);

console.log("=== Extraction Accuracy Evaluation ===");
console.log(`Re-extracting ${sampleJobs.rows.length} jobs and comparing to stored entities\n`);

const scores: number[] = [];

for (const row of sampleJobs.rows as Array<Record<string, unknown>>) {
  const title = (row["title_en"] ?? row["title"]) as string;
  const desc = stripHtml((row["description_en"] ?? row["description"]) as string);
  const company = row["company"] as string;
  const sourceId = row["source_id"] as number;

  const freshExtraction = await extractEntities(title, desc, company);

  const stored = (row["stored_entities"] ?? {}) as Record<string, string[]>;

  const expected: Record<string, string[]> = {};
  const extracted: Record<string, string[]> = {};

  for (const field of ["skill", "technology", "language", "framework", "tool", "platform", "methodology", "soft_skill", "industry"]) {
    const storedField = stored[field] ?? [];
    expected[field] = Array.isArray(storedField) ? storedField : [];

    const key = field === "soft_skill" ? "soft_skills" :
                field === "technology" ? "technologies" :
                field === "methodology" ? "methodologies" :
                field + "s";
    extracted[field] = (freshExtraction as unknown as Record<string, string[]>)[key] ?? [];
  }

  const evalResult = await extractionAccuracyScorer.run({
    input: title,
    output: { extracted, expected },
  });

  const score = evalResult.score ?? 0;
  scores.push(score);

  const status = score > 0.7 ? "\x1b[32mGOOD\x1b[0m" :
                 score > 0.4 ? "\x1b[33mFAIR\x1b[0m" :
                                "\x1b[31mPOOR\x1b[0m";

  console.log(`[${status}] #${sourceId} ${title}`);
  console.log(`       ${evalResult.reason ?? `F1: ${score.toFixed(3)}`}`);
  console.log("");
}

const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
console.log("=== Summary ===");
console.log(`Avg F1: ${avg.toFixed(3)}`);
console.log(`Consistent (>0.7): ${scores.filter((s) => s > 0.7).length}/${scores.length}`);

process.exit(0);
