import "./env.js";
import { StartupJobsClient } from "@repo/startupjobs-api";

const client = new StartupJobsClient();

console.log("=== SKILLS ===");
try {
  const skills = await client.front.getSkills() as Array<{id: number; name: string; slug: string}>;
  console.log(`${skills.length} skills`);
  console.log("Sample:", JSON.stringify(skills.slice(0, 10), null, 2));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== LANGUAGES ===");
try {
  const langs = await client.front.getLanguages();
  console.log(`${(langs as unknown[]).length} languages`);
  console.log("Sample:", JSON.stringify((langs as unknown[]).slice(0, 10), null, 2));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== FIELDS ===");
try {
  const fields = await client.front.getFields() as unknown[];
  console.log(`${fields.length} fields`);
  console.log("Sample:", JSON.stringify(fields.slice(0, 10), null, 2));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== DISCIPLINES ===");
try {
  const disciplines = await client.front.getDisciplines() as unknown[];
  console.log(`${disciplines.length} disciplines`);
  console.log("Sample:", JSON.stringify(disciplines.slice(0, 10), null, 2));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== POSITIONS ===");
try {
  const positions = await client.front.getPositions() as unknown[];
  console.log(`${positions.length} positions`);
  console.log("Sample:", JSON.stringify(positions.slice(0, 10), null, 2));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== WORKPLACES ===");
try {
  const workplaces = await client.front.getWorkplaces() as unknown[];
  console.log(`${workplaces.length} workplaces`);
  console.log("All:", JSON.stringify(workplaces, null, 2));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== SKILL FACETS (top 20) ===");
try {
  const facets = await client.core.facetsSkill();
  const buckets = (facets as any).buckets ?? (facets as any);
  console.log("Type:", typeof facets);
  console.log("Sample:", JSON.stringify(Array.isArray(buckets) ? buckets.slice(0, 20) : facets, null, 2).slice(0, 2000));
} catch (e) { console.log("FAILED:", e); }

console.log("\n=== FIELD FACETS ===");
try {
  const facets = await client.core.facetsField();
  console.log("Sample:", JSON.stringify(facets, null, 2).slice(0, 2000));
} catch (e) { console.log("FAILED:", e); }

process.exit(0);
