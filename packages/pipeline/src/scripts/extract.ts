import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../.env") });

import { createDb } from "../db/connection.js";
import { runExtraction } from "../knowledge/extract-pipeline.js";

const limit = parseInt(process.argv[2] ?? "20", 10);
console.log(`Running knowledge extraction (limit: ${limit})...\n`);

const start = Date.now();
const db = createDb();
await runExtraction(db, { limit });

console.log(`\nFinished in ${((Date.now() - start) / 1000).toFixed(1)}s`);
process.exit(0);
