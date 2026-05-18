import { ollamaGenerate, parseLlmJson } from "../llm/ollama-generate.js";

export interface RerankCandidate {
  id: string;
  title: string;
  company: string;
  locations: string | null;
  seniorities: unknown;
  is_remote: boolean;
}

interface RerankScore {
  index: number;
  score: number;
}

export async function llmRerank(
  query: string,
  candidates: RerankCandidate[],
  options?: { model?: string; topN?: number },
): Promise<string[]> {
  const topN = options?.topN ?? 20;
  const slice = candidates.slice(0, topN);

  const listing = slice
    .map(
      (c, i) =>
        `${i}. "${c.title}" at ${c.company} (${c.locations ?? "N/A"})${c.is_remote ? " [Remote]" : ""}`,
    )
    .join("\n");

  const prompt = `You are a job search relevance ranker. Given a search query and a list of job listings, score each listing from 0-10 for relevance to the query.

Query: "${query}"

Listings:
${listing}

Respond with ONLY a JSON array of objects with "index" and "score" fields, sorted by score descending.
Example: [{"index": 2, "score": 9}, {"index": 0, "score": 7}]`;

  try {
    const response = await ollamaGenerate(prompt, {
      model: options?.model ?? "gemma4",
      temperature: 0,
    });

    const parsed = parseLlmJson<RerankScore[]>(
      response.includes("[") ? `{"items":${response}}` : response,
    );

    if (!parsed) return slice.map((c) => c.id);

    const items: RerankScore[] = Array.isArray(parsed)
      ? parsed
      : (parsed as { items: RerankScore[] }).items ?? [];

    const reranked = items
      .filter((s) => s.index >= 0 && s.index < slice.length)
      .sort((a, b) => b.score - a.score)
      .map((s) => slice[s.index]!.id);

    const seen = new Set(reranked);
    for (const c of slice) {
      if (!seen.has(c.id)) reranked.push(c.id);
    }

    return reranked;
  } catch {
    return slice.map((c) => c.id);
  }
}
