import "./env.js";

import { sql, count } from "drizzle-orm";
import { createDb } from "../db/connection.js";
import { jobListings, entities, jobEntities } from "../db/schema.js";
import { runSync } from "../sync/sync-pipeline.js";
import { hybridSearch } from "../search/hybrid-search.js";
import { runExtraction } from "../knowledge/extract-pipeline.js";

async function smokeTest() {
  const db = createDb();

  console.log("1. Testing DB connection...");
  await db.execute(sql`SELECT 1`);
  console.log("   OK\n");

  console.log("2. Running sync pipeline...");
  await runSync();
  console.log("");

  console.log("3. Verifying data...");
  const [row] = await db.select({ total: count() }).from(jobListings);
  const total = row?.total ?? 0;
  console.log(`   ${total} listings in database`);
  if (total === 0) throw new Error("No listings synced!");
  console.log("");

  console.log("4. Running knowledge extraction (first 5 jobs for smoke test)...");
  await runExtraction(db, { limit: 5 });
  console.log("");

  console.log("5. Verifying knowledge graph...");
  const [entityRow] = await db.select({ total: count() }).from(entities);
  const [relRow] = await db.select({ total: count() }).from(jobEntities);
  console.log(
    `   ${entityRow?.total ?? 0} entities, ${relRow?.total ?? 0} relations`,
  );
  console.log("");

  console.log('6. Testing vectorless search for "frontend developer"...');
  const results = await hybridSearch(db, {
    query: "frontend developer",
    limit: 5,
  });
  console.log(`   Found ${results.length} results`);
  if (results.length === 0) throw new Error("Search returned no results!");
  for (const r of results) {
    console.log(
      `   - [${Number(r.rrf_score).toFixed(4)}] ${r.title} @ ${r.company}`,
    );
  }
  console.log("");

  console.log("=== SMOKE TEST PASSED (vectorless pipeline) ===");
}

smokeTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n=== SMOKE TEST FAILED ===");
    console.error(err);
    process.exit(1);
  });
