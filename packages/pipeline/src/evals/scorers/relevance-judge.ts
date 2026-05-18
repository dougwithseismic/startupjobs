import { createScorer } from "@mastra/core/evals";
import { ollamaGenerate, parseLlmJson } from "../../llm/ollama-generate.js";

async function askJudge(
  query: string,
  results: Array<{ title: string; company: string }>,
): Promise<{ scores: number[]; reasoning: string }> {
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

  try {
    const raw = await ollamaGenerate(prompt, {
      model: "gemma3:4b",
      maxTokens: 512,
    });

    const parsed = parseLlmJson<{
      scores?: number[];
      reasoning?: string;
    }>(raw);

    if (!parsed) {
      return { scores: results.map(() => 0), reasoning: "Parse failed" };
    }

    return {
      scores: Array.isArray(parsed.scores)
        ? parsed.scores.map((s) =>
            typeof s === "number" ? Math.min(2, Math.max(0, s)) : 0,
          )
        : results.map(() => 0),
      reasoning:
        typeof parsed.reasoning === "string"
          ? parsed.reasoning
          : "No reasoning provided",
    };
  } catch {
    return { scores: results.map(() => 0), reasoning: "Judge failed" };
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
    };
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult!.normalizedScore;
  })
  .generateReason(({ results, score }) => {
    const { reasoning, scores } = results.analyzeStepResult!;
    return `Score: ${score.toFixed(3)} | Grades: [${scores.join(",")}] | ${reasoning}`;
  });
