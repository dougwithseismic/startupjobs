import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { createDb } from "../db/connection.js";
import { hybridSearch } from "../search/hybrid-search.js";

const args = process.argv.slice(2);
const skillsFlag = args.findIndex((a) => a === "--skills");
const techFlag = args.findIndex((a) => a === "--tech");
const industryFlag = args.findIndex((a) => a === "--industry");

let query = "";
const requiredSkills: string[] = [];
const requiredTech: string[] = [];
const industry: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--skills" && args[i + 1]) {
    requiredSkills.push(...args[++i]!.split(","));
  } else if (args[i] === "--tech" && args[i + 1]) {
    requiredTech.push(...args[++i]!.split(","));
  } else if (args[i] === "--industry" && args[i + 1]) {
    industry.push(...args[++i]!.split(","));
  } else {
    query += (query ? " " : "") + args[i];
  }
}

if (!query) {
  console.error(
    "Usage: pnpm search <query> [--skills react,typescript] [--tech docker] [--industry fintech]",
  );
  process.exit(1);
}

const db = createDb();
console.log(`Searching for: "${query}"`);
if (requiredSkills.length) console.log(`  Skills filter: ${requiredSkills.join(", ")}`);
if (requiredTech.length) console.log(`  Tech filter: ${requiredTech.join(", ")}`);
if (industry.length) console.log(`  Industry filter: ${industry.join(", ")}`);
console.log("");

const results = await hybridSearch(db, {
  query,
  limit: 10,
  requiredSkills: requiredSkills.length ? requiredSkills : undefined,
  requiredTech: requiredTech.length ? requiredTech : undefined,
  industry: industry.length ? industry : undefined,
});

for (const r of results) {
  const remote = r.is_remote ? " [REMOTE]" : "";
  console.log(
    `[${Number(r.rrf_score).toFixed(4)}] ${r.title} @ ${r.company} (${r.locations ?? "N/A"})${remote}`,
  );
  console.log(`         vector=#${r.vector_rank} text=#${r.text_rank}`);
  if (r.matched_entities) console.log(`         entities: ${r.matched_entities}`);
}

console.log(`\n${results.length} results`);
process.exit(0);
