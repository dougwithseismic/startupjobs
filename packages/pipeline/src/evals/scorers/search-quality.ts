import { createScorer } from "@mastra/core/evals";

function dcg(relevances: number[]): number {
  return relevances.reduce(
    (sum, rel, i) => sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2),
    0,
  );
}

export const searchQualityScorer = createScorer({
  id: "search-quality",
  description:
    "Evaluates search ranking quality using NDCG@K, Precision@K, and MRR",
})
  .preprocess(({ run }) => {
    const output = run.output as {
      resultIds: string[];
      expectedIds: string[];
      relevanceGrades?: Record<string, number>;
      k?: number;
    };
    return output;
  })
  .analyze(({ results }) => {
    const { resultIds, expectedIds, relevanceGrades, k = 10 } =
      results.preprocessStepResult!;

    const relevanceMap = new Map<string, number>();
    if (relevanceGrades) {
      for (const [id, grade] of Object.entries(relevanceGrades)) {
        relevanceMap.set(id, grade);
      }
    } else {
      for (const id of expectedIds) {
        relevanceMap.set(id, 1);
      }
    }

    const predictedRel = resultIds
      .slice(0, k)
      .map((id) => relevanceMap.get(id) ?? 0);
    const idealRel = [...relevanceMap.values()]
      .sort((a, b) => b - a)
      .slice(0, k);
    const idealDcg = dcg(idealRel);
    const ndcg = idealDcg === 0 ? 0 : dcg(predictedRel) / idealDcg;

    const relevantSet = new Set(expectedIds);
    const topK = resultIds.slice(0, k);
    const hits = topK.filter((id) => relevantSet.has(id)).length;
    const precision = hits / Math.min(k, topK.length || 1);

    const firstIdx = resultIds.findIndex((id) => relevantSet.has(id));
    const mrr = firstIdx === -1 ? 0 : 1 / (firstIdx + 1);

    return { ndcg, precision, mrr, k };
  })
  .generateScore(({ results }) => {
    const { ndcg, precision, mrr } = results.analyzeStepResult!;
    return 0.5 * ndcg + 0.3 * precision + 0.2 * mrr;
  })
  .generateReason(({ results, score }) => {
    const { ndcg, precision, mrr, k } = results.analyzeStepResult!;
    return `Score: ${score.toFixed(3)} | NDCG@${k}: ${ndcg.toFixed(3)} | P@${k}: ${precision.toFixed(3)} | MRR: ${mrr.toFixed(3)}`;
  });
