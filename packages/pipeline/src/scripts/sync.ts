import "./env.js";
import { runSync } from "../sync/sync-pipeline.js";

console.log("Starting sync pipeline...\n");
const start = Date.now();
await runSync();
console.log(`\nFinished in ${((Date.now() - start) / 1000).toFixed(1)}s`);
process.exit(0);
