import { sql } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { embedTexts } from "../embeddings/ollama.js";
import { normalizeEntityName } from "../llm/normalize.js";

export interface SearchOptions {
  query: string;
  limit?: number;
  requiredSkills?: string[];
  requiredTech?: string[];
  industry?: string[];
  isRemote?: boolean;
}

export interface SearchResult {
  id: string;
  source_id: number;
  title: string;
  company: string;
  locations: string | null;
  seniorities: unknown;
  is_remote: boolean;
  rrf_score: number;
  vector_rank: number;
  text_rank: number;
  matched_entities: string | null;
}

const RRF_K = 60;

export async function hybridSearch(
  db: Db,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const limit = options.limit ?? 20;
  const candidatePool = limit * 3;

  const [queryEmbedding] = await embedTexts([
    `search_query: ${options.query}`,
  ]);

  const embeddingLiteral = `[${queryEmbedding!.join(",")}]`;

  const hasGraphFilters =
    (options.requiredSkills?.length ?? 0) > 0 ||
    (options.requiredTech?.length ?? 0) > 0 ||
    (options.industry?.length ?? 0) > 0;

  if (!hasGraphFilters) {
    const results = await db.execute(sql`
      WITH vector_search AS (
        SELECT id, source_id, title, company, locations, seniorities, is_remote,
               ROW_NUMBER() OVER (ORDER BY embedding <=> ${embeddingLiteral}::vector) AS rank
        FROM job_listings
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingLiteral}::vector
        LIMIT ${candidatePool}
      ),
      text_search AS (
        SELECT id, source_id, title, company, locations, seniorities, is_remote,
               ROW_NUMBER() OVER (
                 ORDER BY ts_rank(
                   to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(company, '')),
                   websearch_to_tsquery('english', ${options.query})
                 ) DESC
               ) AS rank
        FROM job_listings
        WHERE to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(company, ''))
              @@ websearch_to_tsquery('english', ${options.query})
        LIMIT ${candidatePool}
      ),
      combined AS (
        SELECT
          COALESCE(v.id, t.id) AS id,
          COALESCE(v.source_id, t.source_id) AS source_id,
          COALESCE(v.title, t.title) AS title,
          COALESCE(v.company, t.company) AS company,
          COALESCE(v.locations, t.locations) AS locations,
          COALESCE(v.seniorities, t.seniorities) AS seniorities,
          COALESCE(v.is_remote, t.is_remote) AS is_remote,
          COALESCE(1.0 / (${RRF_K} + v.rank), 0) + COALESCE(1.0 / (${RRF_K} + t.rank), 0) AS rrf_score,
          COALESCE(v.rank, 999) AS vector_rank,
          COALESCE(t.rank, 999) AS text_rank,
          NULL::text AS matched_entities
        FROM vector_search v
        FULL OUTER JOIN text_search t ON v.id = t.id
      )
      SELECT * FROM combined
      ORDER BY rrf_score DESC
      LIMIT ${limit}
    `);

    return results.rows as unknown as SearchResult[];
  }

  const allFilters = [
    ...(options.requiredSkills ?? []),
    ...(options.requiredTech ?? []),
    ...(options.industry ?? []),
  ];
  const normalizedFilters = allFilters.map(normalizeEntityName);
  const pgArray = `{${normalizedFilters.join(",")}}`;

  const results = await db.execute(sql`
    WITH graph_filtered AS (
      SELECT
        je.job_id,
        string_agg(DISTINCT e.name, ', ') AS matched_entities,
        COUNT(DISTINCT e.normalized_name) AS match_count
      FROM job_entities je
      JOIN entities e ON e.id = je.entity_id
      WHERE e.normalized_name = ANY(${pgArray}::text[])
      GROUP BY je.job_id
    ),
    vector_search AS (
      SELECT jl.id, jl.source_id, jl.title, jl.company, jl.locations,
             jl.seniorities, jl.is_remote, gf.matched_entities, gf.match_count,
             ROW_NUMBER() OVER (ORDER BY jl.embedding <=> ${embeddingLiteral}::vector) AS rank
      FROM job_listings jl
      JOIN graph_filtered gf ON gf.job_id = jl.id
      WHERE jl.embedding IS NOT NULL
      ORDER BY jl.embedding <=> ${embeddingLiteral}::vector
      LIMIT ${candidatePool}
    ),
    text_search AS (
      SELECT jl.id, jl.source_id, jl.title, jl.company, jl.locations,
             jl.seniorities, jl.is_remote, gf.matched_entities, gf.match_count,
             ROW_NUMBER() OVER (
               ORDER BY ts_rank(
                 to_tsvector('english', coalesce(jl.title, '') || ' ' || coalesce(jl.description, '') || ' ' || coalesce(jl.company, '')),
                 websearch_to_tsquery('english', ${options.query})
               ) DESC
             ) AS rank
      FROM job_listings jl
      JOIN graph_filtered gf ON gf.job_id = jl.id
      WHERE to_tsvector('english', coalesce(jl.title, '') || ' ' || coalesce(jl.description, '') || ' ' || coalesce(jl.company, ''))
            @@ websearch_to_tsquery('english', ${options.query})
      LIMIT ${candidatePool}
    ),
    combined AS (
      SELECT
        COALESCE(v.id, t.id) AS id,
        COALESCE(v.source_id, t.source_id) AS source_id,
        COALESCE(v.title, t.title) AS title,
        COALESCE(v.company, t.company) AS company,
        COALESCE(v.locations, t.locations) AS locations,
        COALESCE(v.seniorities, t.seniorities) AS seniorities,
        COALESCE(v.is_remote, t.is_remote) AS is_remote,
        (
          COALESCE(1.0 / (${RRF_K} + v.rank), 0) +
          COALESCE(1.0 / (${RRF_K} + t.rank), 0) +
          COALESCE(v.match_count, t.match_count)::float * 0.01
        ) AS rrf_score,
        COALESCE(v.rank, 999) AS vector_rank,
        COALESCE(t.rank, 999) AS text_rank,
        COALESCE(v.matched_entities, t.matched_entities) AS matched_entities
      FROM vector_search v
      FULL OUTER JOIN text_search t ON v.id = t.id
    )
    SELECT * FROM combined
    ORDER BY rrf_score DESC
    LIMIT ${limit}
  `);

  return results.rows as unknown as SearchResult[];
}
