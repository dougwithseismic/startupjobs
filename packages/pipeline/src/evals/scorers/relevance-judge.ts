import { createScorer } from "@mastra/core/evals";

interface OllamaGenerateResponse {
  response: string;
}

async function askJudge(
  query: string,
  results: Array<{ title: string; company: string }>,
): Promise<{ scores: number[]; reasoning: string }> {
  const baseUrl = process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434";

  const resultsText = results
    .map((r, i) => `${i + 1}. ${r.title} @ ${r.company}`)
    .join("\n");

  const prompt = `You are a search relevance judge. Rate how relevant each search result is to the query.

Query: "${query}"

Results:
${resultsText}

For each result, give a score: 2 = highly relevant, 1 = somewhat relevant, 0 = not relevant.

Return ONLY valid JSON (no markdown, no code fences):
{"scores":[2,1,0,...],"reasoning":"one sentence explaining your overall assessment"}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemma3:4b",
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 512 },
    }),
  });

  if (!response.ok) {
    return { scores: results.map(() => 0), reasoning: "Judge failed" };
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  const cleaned = data.response
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return { scores: results.map(() => 0), reasoning: "Parse failed" };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      scores?: number[];
      reasoning?: string;
    };
    return {
      scores: Array.isArray(parsed.scores)
        ? parsed.scores.map((s) => (typeof s === "number" ? Math.min(2, Math.max(0, s)) : 0))
        : results.map(() => 0),
      reasoning:
        typeof parsed.reasoning === "string"
          ? parsed.reasoning
          : "No reasoning provided",
    };
  } catch {
    return { scores: results.map(() => 0), reasoning: "JSON parse error" };
  }
}

export const relevanceJudgeScorer = createScorer({
  id: "relevance-judge",
  description: "LLM-as-judge relevance scoring using local Gemma 3 4B",
})
  .preprocess(({ run }) => {
    const output = run.output as {
      query: string;
      results: Array<{ title: string; company: string }>;
    };
    return output;
  })
  .analyze(async ({ results }) => {
    const { query, results: searchResults } = results.preprocessStepResult!;
    const judgeResult = await askJudge(query, searchResults);
    const maxPossible = searchResults.length * 2;
    const totalScore = judgeResult.scores.reduce((a, b) => a + b, 0);
    return {
      normalizedScore: maxPossible > 0 ? totalScore / maxPossible : 0,
      scores: judgeResult.scores,
      reasoning: judgeResult.reasoning,
      totalResults: searchResults.length,
    };
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult!.normalizedScore;
  })
  .generateReason(({ results, score }) => {
    const { reasoning, scores } = results.analyzeStepResult!;
    const dist = `[${scores.join(",")}]`;
    return `Score: ${score.toFixed(3)} | Grades: ${dist} | ${reasoning}`;
  });
