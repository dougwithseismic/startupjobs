import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export function createDb(connectionString?: string) {
  const pool = new pg.Pool({
    connectionString: connectionString ?? process.env["DATABASE_URL"],
  });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
