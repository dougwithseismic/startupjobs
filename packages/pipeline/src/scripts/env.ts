import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let depth = __dirname;
let envPath: string | undefined;
for (let i = 0; i < 6; i++) {
  const candidate = resolve(depth, ".env");
  try {
    const { statSync } = await import("node:fs");
    if (statSync(candidate).isFile()) {
      envPath = candidate;
      break;
    }
  } catch { /* keep looking */ }
  depth = resolve(depth, "..");
}

if (envPath) config({ path: envPath });
