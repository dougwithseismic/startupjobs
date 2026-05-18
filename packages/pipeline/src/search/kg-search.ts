import { sql } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { normalizeEntityName } from "../llm/normalize.js";

export interface KgCandidate {
  job_id: string;
  kg_score: number;
  match_count: number;
  matched_entities: string;
}

const TYPE_WEIGHT: Record<string, number> = {
  technology: 3,
  skill: 3,
  framework: 2.5,
  language: 2,
  tool: 1.5,
  platform: 1.5,
  methodology: 1,
  industry: 1,
  certification: 1,
  soft_skill: 0.5,
};

const RELATION_WEIGHT: Record<string, number> = {
  requires: 1.0,
  uses: 0.8,
  prefers: 0.7,
  teaches: 0.6,
  belongs_to: 0.5,
  offers: 0.3,
};

export function expandQueryToEntityNames(query: string): string[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates: string[] = [];

  for (const token of tokens) {
    if (token.length >= 2) candidates.push(normalizeEntityName(token));
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    candidates.push(normalizeEntityName(`${tokens[i]} ${tokens[i + 1]}`));
  }

  for (let i = 0; i < tokens.length - 2; i++) {
    candidates.push(
      normalizeEntityName(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`),
    );
  }

  return [...new Set(candidates)];
}

export async function kgSearch(
  db: Db,
  entityNames: string[],
  limit: number,
): Promise<KgCandidate[]> {
  if (entityNames.length === 0) return [];

  const pgArray = `{${entityNames.join(",")}}`;

  const results = await db.execute(sql`
    SELECT
      je.job_id,
      SUM(
        COALESCE(
          CASE e.type
            WHEN 'technology' THEN 3 WHEN 'skill' THEN 3
            WHEN 'framework' THEN 2.5 WHEN 'language' THEN 2
            WHEN 'tool' THEN 1.5 WHEN 'platform' THEN 1.5
            WHEN 'methodology' THEN 1 WHEN 'industry' THEN 1
            WHEN 'certification' THEN 1 WHEN 'spoken_language' THEN 2
            WHEN 'soft_skill' THEN 0.5
            ELSE 1
          END, 1
        ) *
        COALESCE(
          CASE je.relation
            WHEN 'requires' THEN 1.0 WHEN 'uses' THEN 0.8
            WHEN 'prefers' THEN 0.7 WHEN 'teaches' THEN 0.6
            WHEN 'belongs_to' THEN 0.5 WHEN 'offers' THEN 0.3
            ELSE 0.5
          END, 0.5
        ) *
        (je.confidence / 100.0)
      ) AS kg_score,
      COUNT(DISTINCT e.id) AS match_count,
      string_agg(DISTINCT e.name, ', ') AS matched_entities
    FROM job_entities je
    JOIN entities e ON e.id = je.entity_id
    WHERE e.normalized_name = ANY(${pgArray}::text[])
    GROUP BY je.job_id
    ORDER BY kg_score DESC
    LIMIT ${limit}
  `);

  return results.rows as unknown as KgCandidate[];
}

export { TYPE_WEIGHT, RELATION_WEIGHT };
