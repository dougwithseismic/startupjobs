import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });
import { runSync } from "../sync/sync-pipeline.js";

console.log("Starting sync pipeline...\n");
const start = Date.now();
await runSync();
console.log(`\nFinished in ${((Date.now() - start) / 1000).toFixed(1)}s`);
process.exit(0);
