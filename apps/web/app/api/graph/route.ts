import { NextResponse } from "next/server";
import pg from "pg";

const pool = new pg.Pool({
  connectionString:
    process.env["DATABASE_URL"] ??
    "postgresql://startupjobs:startupjobs@localhost:5434/startupjobs",
});

export async function GET() {
  const client = await pool.connect();
  try {
    const entitiesRes = await client.query(`
      SELECT e.id, e.name, e.type, COUNT(DISTINCT je.job_id) as job_count
      FROM entities e
      JOIN job_entities je ON je.entity_id = e.id
      GROUP BY e.id, e.name, e.type
      HAVING COUNT(DISTINCT je.job_id) >= 2
      ORDER BY job_count DESC
      LIMIT 200
    `);

    const jobsRes = await client.query(`
      SELECT jl.id, jl.title, jl.company, jl.detected_language,
             jl.is_remote, jl.locations, jl.seniorities, jl.is_startup,
             jl.main_area,
             (SELECT COUNT(*) FROM job_entities je WHERE je.job_id = jl.id) as entity_count,
             (SELECT COUNT(*) FROM job_entities je
              JOIN entities e ON e.id = je.entity_id
              WHERE je.job_id = jl.id AND e.type IN ('technology','language','framework','tool','platform')
             ) as tech_count,
             (SELECT COUNT(*) FROM job_entities je
              JOIN entities e ON e.id = je.entity_id
              WHERE je.job_id = jl.id AND e.type IN ('soft_skill')
             ) as soft_count
      FROM job_listings jl
      WHERE jl.extracted_at IS NOT NULL
      LIMIT 150
    `);

    const entityIds = entitiesRes.rows.map((r: { id: string }) => r.id);
    const jobIds = jobsRes.rows.map((r: { id: string }) => r.id);

    const linksRes = await client.query(
      `SELECT je.job_id, je.entity_id, je.relation
       FROM job_entities je
       WHERE je.entity_id = ANY($1) AND je.job_id = ANY($2)`,
      [entityIds, jobIds],
    );

    const nodes = [
      ...entitiesRes.rows.map(
        (r: {
          id: string;
          name: string;
          type: string;
          job_count: string;
        }) => ({
          id: `e-${r.id}`,
          label: r.name,
          type: r.type,
          size: Number(r.job_count),
          jobCount: Number(r.job_count),
        }),
      ),
      ...jobsRes.rows.map(
        (r: {
          id: string;
          title: string;
          company: string;
          is_remote: boolean;
          is_startup: boolean;
          locations: string;
          seniorities: string[];
          main_area: string;
          entity_count: string;
          tech_count: string;
          soft_count: string;
        }) => {
          const seniorities = Array.isArray(r.seniorities)
            ? r.seniorities
            : [];
          const seniorityScore = seniorities.includes("senior")
            ? 3
            : seniorities.includes("medior")
              ? 2
              : seniorities.includes("junior")
                ? 1
                : 0;

          return {
            id: `j-${r.id}`,
            label: `${r.title} @ ${r.company}`,
            type: "job",
            size: 3,
            company: r.company,
            isRemote: r.is_remote,
            isStartup: r.is_startup,
            locations: r.locations,
            mainArea: r.main_area,
            seniorityScore,
            entityCount: Number(r.entity_count),
            techCount: Number(r.tech_count),
            softCount: Number(r.soft_count),
          };
        },
      ),
    ];

    const nodeIds = new Set(nodes.map((n: { id: string }) => n.id));
    const edges = linksRes.rows
      .map(
        (r: { job_id: string; entity_id: string; relation: string }) => ({
          source: `j-${r.job_id}`,
          target: `e-${r.entity_id}`,
          relation: r.relation,
        }),
      )
      .filter(
        (e: { source: string; target: string }) =>
          nodeIds.has(e.source) && nodeIds.has(e.target),
      );

    const companies = [
      ...new Set(
        jobsRes.rows.map((r: { company: string }) => r.company),
      ),
    ].sort();

    return NextResponse.json({ nodes, edges, companies });
  } finally {
    client.release();
  }
}
