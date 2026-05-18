import "./env.js";
import { StartupJobsClient } from "@repo/startupjobs-api";

const client = new StartupJobsClient();

const facets = await client.core.facetsSkill() as { skills: Array<{ name: string; id: string; count: number }> };
const skills = facets.skills.sort((a, b) => b.count - a.count);

console.log(`${skills.length} skills total\n`);
for (const s of skills) {
  console.log(`  ${s.name.padEnd(30)} (${s.id}) — ${s.count} offers`);
}

console.log("\n\nAs JSON array for prompt:");
console.log(JSON.stringify(skills.map(s => s.name)));

process.exit(0);
