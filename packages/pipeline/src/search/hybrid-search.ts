import { sql } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { parseSearchQuery } from "./query-parser.js";
import { expandQueryToEntityNames, kgSearch } from "./kg-search.js";
import {
  structuredSearch,
  hasStructuredCriteria,
  type StructuredCriteria,
} from "./structured-score.js";
import { weightedRRF, type ChannelInput } from "./fusion.js";
import { llmRerank, type RerankCandidate } from "./reranker.js";

export interface SearchOptions {
  query: string;
  limit?: number;
  requiredSkills?: string[];
  requiredTech?: string[];
  industry?: string[];
  seniority?: string[];
  location?: string;
  isRemote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  useReranker?: boolean;
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
  text_rank: number;
  kg_rank: number;
  structured_rank: number;
  matched_entities: string | null;
}

const WEIGHTS = {
  text: 0.35,
  kg: 0.35,
  structured: 0.20,
  expansion: 0.10,
};

export async function hybridSearch(
  db: Db,
  options: SearchOptions,
): Promise<SearchResult[]> {
  const limit = options.limit ?? 20;
  const candidatePool = limit * 5;

  const parsed = parseSearchQuery(options.query);

  // --- Channel 1: BM25 Full-Text Search (weighted fields) ---
  const textQuery = parsed.textQuery || options.query;
  const textResults = await db.execute(sql`
    SELECT id, source_id, title, company, locations, seniorities, is_remote,
           ts_rank_cd(
             setweight(to_tsvector('english', coalesce(title_en, title)), 'A') ||
             setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
             setweight(to_tsvector('english', coalesce(description_en, description)), 'D'),
             websearch_to_tsquery('english', ${textQuery})
           ) AS score,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               setweight(to_tsvector('english', coalesce(title_en, title)), 'A') ||
               setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
               setweight(to_tsvector('english', coalesce(description_en, description)), 'D'),
               websearch_to_tsquery('english', ${textQuery})
             ) DESC
           ) AS rank
    FROM job_listings
    WHERE (
      setweight(to_tsvector('english', coalesce(title_en, title)), 'A') ||
      setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(description_en, description)), 'D')
    ) @@ websearch_to_tsquery('english', ${textQuery})
    LIMIT ${candidatePool}
  `);

  // --- Channel 2: Knowledge Graph Search ---
  const explicitEntities = [
    ...(options.requiredSkills ?? []),
    ...(options.requiredTech ?? []),
    ...(options.industry ?? []),
  ];
  const expandedNames = expandQueryToEntityNames(textQuery);
  const allEntityNames = [
    ...explicitEntities.map((e) => e.toLowerCase().replace(/[^a-z0-9+#.]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")),
    ...expandedNames,
  ];
  const uniqueEntityNames = [...new Set(allEntityNames)];

  const kgResults = await kgSearch(db, uniqueEntityNames, candidatePool);

  // --- Channel 3: Structured Data Search ---
  const structuredCriteria: StructuredCriteria = {
    seniority: options.seniority?.length
      ? options.seniority
      : parsed.seniority.length
        ? parsed.seniority
        : undefined,
    isRemote: options.isRemote ?? parsed.isRemote,
    location: options.location,
    salaryMin: options.salaryMin ?? parsed.salaryMin,
    salaryMax: options.salaryMax ?? parsed.salaryMax,
  };

  const structuredResults = await structuredSearch(
    db,
    structuredCriteria,
    candidatePool,
  );

  // --- Fuse all channels ---
  const channels: ChannelInput[] = [
    {
      name: "text",
      weight: WEIGHTS.text,
      items: (textResults.rows as Array<{ id: string; rank: number }>).map(
        (r) => ({ id: r.id, rank: Number(r.rank) }),
      ),
    },
    {
      name: "kg",
      weight: explicitEntities.length > 0 ? WEIGHTS.kg + WEIGHTS.expansion : WEIGHTS.kg,
      items: kgResults.map((r, i) => ({ id: r.job_id, rank: i + 1 })),
    },
  ];

  if (hasStructuredCriteria(structuredCriteria)) {
    channels.push({
      name: "structured",
      weight: WEIGHTS.structured,
      items: structuredResults.map((r, i) => ({ id: r.id, rank: i + 1 })),
    });
  }

  const fused = weightedRRF(channels);

  // --- Hydrate top results ---
  const topIds = fused.slice(0, options.useReranker ? limit * 2 : limit).map((f) => f.id);
  if (topIds.length === 0) return [];

  const pgIds = `{${topIds.join(",")}}`;
  const hydrated = await db.execute(sql`
    SELECT id, source_id, title, company, locations, seniorities, is_remote
    FROM job_listings
    WHERE id = ANY(${pgIds}::uuid[])
  `);

  const jobMap = new Map(
    (hydrated.rows as Array<Record<string, unknown>>).map((r) => [r.id as string, r]),
  );
  const kgMap = new Map(kgResults.map((r) => [r.job_id, r]));

  let orderedIds = topIds;

  // --- Optional LLM Rerank ---
  if (options.useReranker) {
    const candidates: RerankCandidate[] = topIds
      .map((id) => {
        const job = jobMap.get(id);
        if (!job) return null;
        return {
          id,
          title: job.title as string,
          company: job.company as string,
          locations: job.locations as string | null,
          seniorities: job.seniorities,
          is_remote: job.is_remote as boolean,
        };
      })
      .filter(Boolean) as RerankCandidate[];

    orderedIds = await llmRerank(options.query, candidates, { topN: limit * 2 });
    orderedIds = orderedIds.slice(0, limit);
  }

  // --- Build final results ---
  return orderedIds
    .map((id) => {
      const job = jobMap.get(id);
      if (!job) return null;
      const fusedEntry = fused.find((f) => f.id === id);
      const kgEntry = kgMap.get(id);

      return {
        id,
        source_id: job.source_id as number,
        title: job.title as string,
        company: job.company as string,
        locations: job.locations as string | null,
        seniorities: job.seniorities,
        is_remote: job.is_remote as boolean,
        rrf_score: fusedEntry?.score ?? 0,
        text_rank: fusedEntry?.channelRanks["text"] ?? 999,
        kg_rank: fusedEntry?.channelRanks["kg"] ?? 999,
        structured_rank: fusedEntry?.channelRanks["structured"] ?? 999,
        matched_entities: kgEntry?.matched_entities ?? null,
      } satisfies SearchResult;
    })
    .filter(Boolean) as SearchResult[];
}
