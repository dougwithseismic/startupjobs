import { sql } from "drizzle-orm";
import type { Db } from "../db/connection.js";

export interface StructuredCriteria {
  seniority?: string[];
  isRemote?: boolean | null;
  location?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
}

export interface StructuredCandidate {
  id: string;
  structured_score: number;
}

export function hasStructuredCriteria(c: StructuredCriteria): boolean {
  return (
    (c.seniority?.length ?? 0) > 0 ||
    c.isRemote != null ||
    !!c.location ||
    c.salaryMin != null ||
    c.salaryMax != null
  );
}

export async function structuredSearch(
  db: Db,
  criteria: StructuredCriteria,
  limit: number,
): Promise<StructuredCandidate[]> {
  if (!hasStructuredCriteria(criteria)) return [];

  const seniorityArray =
    criteria.seniority?.length
      ? `{${criteria.seniority.join(",")}}`
      : null;

  const results = await db.execute(sql`
    SELECT id,
      (
        CASE
          WHEN ${seniorityArray}::text[] IS NOT NULL THEN
            (SELECT COUNT(*)::float FROM jsonb_array_elements_text(seniorities) s
             WHERE s = ANY(${seniorityArray}::text[])) * 0.3
          ELSE 0
        END
        +
        CASE
          WHEN ${criteria.isRemote ?? null}::boolean IS NOT NULL
               AND is_remote = ${criteria.isRemote ?? null}::boolean
          THEN 0.2 ELSE 0
        END
        +
        CASE
          WHEN ${criteria.location ?? null}::text IS NOT NULL
               AND locations ILIKE '%' || ${criteria.location ?? null}::text || '%'
          THEN 0.15 ELSE 0
        END
        +
        CASE
          WHEN ${criteria.salaryMin ?? null}::int IS NOT NULL
               AND salary IS NOT NULL
               AND (salary->>'min')::int >= ${criteria.salaryMin ?? 0}
          THEN 0.15 ELSE 0
        END
        +
        CASE
          WHEN ${criteria.salaryMax ?? null}::int IS NOT NULL
               AND salary IS NOT NULL
               AND (salary->>'max')::int <= ${criteria.salaryMax ?? 0}
          THEN 0.1 ELSE 0
        END
      ) AS structured_score
    FROM job_listings
    WHERE
      (${seniorityArray}::text[] IS NULL OR seniorities @> to_jsonb(${seniorityArray}::text[]))
      OR (${criteria.isRemote ?? null}::boolean IS NOT NULL AND is_remote = ${criteria.isRemote ?? null}::boolean)
      OR (${criteria.location ?? null}::text IS NOT NULL AND locations ILIKE '%' || ${criteria.location ?? null}::text || '%')
      OR (${criteria.salaryMin ?? null}::int IS NOT NULL AND salary IS NOT NULL)
    ORDER BY structured_score DESC
    LIMIT ${limit}
  `);

  return results.rows as unknown as StructuredCandidate[];
}
