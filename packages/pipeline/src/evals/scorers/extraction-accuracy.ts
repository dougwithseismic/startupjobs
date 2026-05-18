import { createScorer } from "@mastra/core/evals";

function f1(predicted: string[], expected: string[]): number {
  const predSet = new Set(predicted.map((s) => s.toLowerCase()));
  const expSet = new Set(expected.map((s) => s.toLowerCase()));

  if (predSet.size === 0 && expSet.size === 0) return 1;
  if (predSet.size === 0 || expSet.size === 0) return 0;

  let tp = 0;
  for (const item of predSet) {
    if (expSet.has(item)) tp++;
  }

  const precision = tp / predSet.size;
  const recall = tp / expSet.size;

  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export const extractionAccuracyScorer = createScorer({
  id: "extraction-accuracy",
  description:
    "Evaluates entity extraction accuracy using per-field F1 scores",
})
  .preprocess(({ run }) => {
    const output = run.output as {
      extracted: Record<string, string[]>;
      expected: Record<string, string[]>;
    };
    return output;
  })
  .analyze(({ results }) => {
    const { extracted, expected } = results.preprocessStepResult!;
    const fields = Object.keys(expected);
    const fieldScores: Record<string, number> = {};
    let totalF1 = 0;

    for (const field of fields) {
      const score = f1(extracted[field] ?? [], expected[field] ?? []);
      fieldScores[field] = score;
      totalF1 += score;
    }

    return {
      fieldScores,
      avgF1: fields.length > 0 ? totalF1 / fields.length : 0,
      fieldsEvaluated: fields.length,
    };
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult!.avgF1;
  })
  .generateReason(({ results, score }) => {
    const { fieldScores } = results.analyzeStepResult!;
    const details = Object.entries(fieldScores)
      .map(([k, v]) => `${k}: ${v.toFixed(2)}`)
      .join(", ");
    return `Avg F1: ${score.toFixed(3)} | ${details}`;
  });
