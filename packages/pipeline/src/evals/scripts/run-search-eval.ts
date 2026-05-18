import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../../.env") });

import { readFileSync } from "node:fs";
import { createDb } from "../../db/connection.js";
import { hybridSearch } from "../../search/hybrid-search.js";
import { searchQualityScorer } from "../scorers/search-quality.js";
import { relevanceJudgeScorer } from "../scorers/relevance-judge.js";

interface GoldenCase {
  query: string;
  expectedSourceIds: number[];
  category: string;
  description: string;
}

const goldenDataPath = resolve(__dirname, "../datasets/search-golden.json");
const goldenData = JSON.parse(
  readFileSync(goldenDataPath, "utf-8"),
) as GoldenCase[];

const db = createDb();
const useJudge = process.argv.includes("--judge");

console.log(`=== Search Quality Evaluation ===`);
console.log(`${goldenData.length} test cases${useJudge ? " + LLM judge" : ""}\n`);

interface EvalRow {
  query: string;
  category: string;
  metricScore: number;
  judgeScore: number | null;
  found: number;
  expected: number;
  reason: string;
  judgeReason: string;
}

const results: EvalRow[] = [];
const categoryScores: Record<string, number[]> = {};

for (let ci = 0; ci < goldenData.length; ci++) {
  const testCase = goldenData[ci]!;
  const searchResults = await hybridSearch(db, {
    query: testCase.query,
    limit: 10,
  });

  const resultIds = searchResults.map((r) => r.source_id);
  const expectedSet = new Set(testCase.expectedSourceIds);
  const found = resultIds.filter((id) => expectedSet.has(id)).length;

  const relevanceGrades: Record<string, number> = {};
  for (let i = 0; i < testCase.expectedSourceIds.length; i++) {
    relevanceGrades[String(testCase.expectedSourceIds[i])] =
      testCase.expectedSourceIds.length - i;
  }

  const metricResult = await searchQualityScorer.run({
    input: testCase.query,
    output: {
      resultIds: resultIds.map(String),
      expectedIds: testCase.expectedSourceIds.map(String),
      relevanceGrades,
      k: 10,
    },
  });

  let judgeScore: number | null = null;
  let judgeReason = "";

  if (useJudge) {
    const judgeResult = await relevanceJudgeScorer.run({
      input: testCase.query,
      output: {
        query: testCase.query,
        results: searchResults.map((r) => ({
          title: r.title,
          company: r.company,
        })),
      },
    });
    judgeScore = judgeResult.score ?? 0;
    judgeReason = judgeResult.reason ?? "";
  }

  const score = metricResult.score ?? 0;
  const row: EvalRow = {
    query: testCase.query,
    category: testCase.category,
    metricScore: score,
    judgeScore,
    found,
    expected: testCase.expectedSourceIds.length,
    reason: metricResult.reason ?? "",
    judgeReason,
  };
  results.push(row);

  if (!categoryScores[row.category]) categoryScores[row.category] = [];
  categoryScores[row.category]!.push(score);

  const status =
    score > 0.5 ? "\x1b[32mPASS\x1b[0m" :
    score > 0.2 ? "\x1b[33mFAIR\x1b[0m" :
    found > 0  ? "\x1b[33mWEAK\x1b[0m" :
                  "\x1b[31mMISS\x1b[0m";

  console.log(
    `[${status}] [${ci + 1}/${goldenData.length}] "${testCase.query}" (${testCase.category})`,
  );
  console.log(`       ${row.reason} | Found: ${found}/${row.expected}`);
  if (judgeScore !== null) {
    console.log(`       Judge: ${judgeReason}`);
  }

  if (found > 0) {
    const matched = searchResults
      .filter((r) => expectedSet.has(r.source_id))
      .map((r) => `${r.title} (#${r.source_id})`);
    console.log(`       Matched: ${matched.join(", ")}`);
  }
  console.log("");
}

// Summary
const avgMetric =
  results.reduce((a, r) => a + r.metricScore, 0) / results.length;
const passing = results.filter((r) => r.metricScore > 0.2).length;

console.log("=== Summary ===");
console.log(`Total cases:  ${results.length}`);
console.log(`Avg Score:    ${avgMetric.toFixed(3)}`);
console.log(
  `Pass rate:    ${passing}/${results.length} (${((passing / results.length) * 100).toFixed(0)}%)`,
);

if (useJudge) {
  const judged = results.filter((r) => r.judgeScore !== null);
  const avgJudge =
    judged.reduce((a, r) => a + (r.judgeScore ?? 0), 0) / judged.length;
  console.log(`Avg Judge:    ${avgJudge.toFixed(3)}`);
}

console.log("\n=== By Category ===");
for (const [cat, scores] of Object.entries(categoryScores).sort()) {
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const pass = scores.filter((s) => s > 0.2).length;
  console.log(
    `  ${cat.padEnd(15)} avg=${avg.toFixed(3)}  pass=${pass}/${scores.length}`,
  );
}

process.exit(0);
