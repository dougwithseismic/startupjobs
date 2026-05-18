import { NextResponse } from "next/server";
import pg from "pg";

declare global {
  var __pgPool: pg.Pool | undefined;
}

function getPool(): pg.Pool {
  if (!globalThis.__pgPool) {
    const url = process.env["DATABASE_URL"];
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__pgPool = new pg.Pool({ connectionString: url });
  }
  return globalThis.__pgPool;
}

export async function GET() {
  const client = await getPool().connect();
  try {
    const [entitiesRes, jobsRes] = await Promise.all([
      client.query(`
        SELECT e.id, e.name, e.type, COUNT(DISTINCT je.job_id) as job_count
        FROM entities e
        JOIN job_entities je ON je.entity_id = e.id
        GROUP BY e.id, e.name, e.type
        HAVING COUNT(DISTINCT je.job_id) >= 2
        ORDER BY job_count DESC
        LIMIT 200
      `),
      client.query(`
        SELECT jl.id, jl.title, jl.company, jl.is_remote, jl.locations
        FROM job_listings jl
        WHERE jl.extracted_at IS NOT NULL
        LIMIT 150
      `),
    ]);

    const entityIds = entitiesRes.rows.map((r: { id: string }) => r.id);
    const jobIds = jobsRes.rows.map((r: { id: string }) => r.id);

    const linksRes = await client.query(
      `SELECT je.job_id, je.entity_id
       FROM job_entities je
       WHERE je.entity_id = ANY($1) AND je.job_id = ANY($2)`,
      [entityIds, jobIds],
    );

    const nodes = [
      ...entitiesRes.rows.map(
        (r: { id: string; name: string; type: string; job_count: string }) => ({
          id: `e-${r.id}`,
          label: r.name,
          type: r.type,
          size: Number(r.job_count),
        }),
      ),
      ...jobsRes.rows.map(
        (r: { id: string; title: string; company: string; is_remote: boolean; locations: string }) => ({
          id: `j-${r.id}`,
          label: `${r.title} @ ${r.company}`,
          type: "job",
          size: 3,
        }),
      ),
    ];

    const nodeIds = new Set(nodes.map((n: { id: string }) => n.id));
    const edges = linksRes.rows
      .map((r: { job_id: string; entity_id: string }) => ({
        source: `j-${r.job_id}`,
        target: `e-${r.entity_id}`,
      }))
      .filter(
        (e: { source: string; target: string }) =>
          nodeIds.has(e.source) && nodeIds.has(e.target),
      );

    return NextResponse.json({ nodes, edges });
  } finally {
    client.release();
  }
}
