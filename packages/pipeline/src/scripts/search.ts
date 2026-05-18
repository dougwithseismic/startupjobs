import "./env.js";

import { createDb } from "../db/connection.js";
import { hybridSearch } from "../search/hybrid-search.js";

const args = process.argv.slice(2);

let query = "";
const requiredSkills: string[] = [];
const requiredTech: string[] = [];
const industry: string[] = [];
const seniority: string[] = [];
let location: string | undefined;
let isRemote: boolean | undefined;
let useReranker = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--skills" && args[i + 1]) {
    requiredSkills.push(...args[++i]!.split(","));
  } else if (args[i] === "--tech" && args[i + 1]) {
    requiredTech.push(...args[++i]!.split(","));
  } else if (args[i] === "--industry" && args[i + 1]) {
    industry.push(...args[++i]!.split(","));
  } else if (args[i] === "--seniority" && args[i + 1]) {
    seniority.push(...args[++i]!.split(","));
  } else if (args[i] === "--location" && args[i + 1]) {
    location = args[++i];
  } else if (args[i] === "--remote") {
    isRemote = true;
  } else if (args[i] === "--rerank") {
    useReranker = true;
  } else {
    query += (query ? " " : "") + args[i];
  }
}

if (!query) {
  console.error(
    "Usage: pnpm search <query> [--skills react,typescript] [--tech docker] [--industry fintech] [--seniority senior] [--location prague] [--remote] [--rerank]",
  );
  process.exit(1);
}

const db = createDb();
console.log(`Searching for: "${query}"`);
if (requiredSkills.length) console.log(`  Skills filter: ${requiredSkills.join(", ")}`);
if (requiredTech.length) console.log(`  Tech filter: ${requiredTech.join(", ")}`);
if (industry.length) console.log(`  Industry filter: ${industry.join(", ")}`);
if (seniority.length) console.log(`  Seniority filter: ${seniority.join(", ")}`);
if (location) console.log(`  Location filter: ${location}`);
if (isRemote) console.log(`  Remote only`);
if (useReranker) console.log(`  LLM reranking enabled`);
console.log("");

const results = await hybridSearch(db, {
  query,
  limit: 10,
  requiredSkills: requiredSkills.length ? requiredSkills : undefined,
  requiredTech: requiredTech.length ? requiredTech : undefined,
  industry: industry.length ? industry : undefined,
  seniority: seniority.length ? seniority : undefined,
  location,
  isRemote,
  useReranker,
});

for (const r of results) {
  const remote = r.is_remote ? " [REMOTE]" : "";
  console.log(
    `[${Number(r.rrf_score).toFixed(4)}] ${r.title} @ ${r.company} (${r.locations ?? "N/A"})${remote}`,
  );
  console.log(`         text=#${r.text_rank} kg=#${r.kg_rank} struct=#${r.structured_rank}`);
  if (r.matched_entities) console.log(`         entities: ${r.matched_entities}`);
}

console.log(`\n${results.length} results`);
process.exit(0);
