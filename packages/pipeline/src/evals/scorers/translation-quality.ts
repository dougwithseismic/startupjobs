import { createScorer } from "@mastra/core/evals";
import { embedTexts } from "../../embeddings/ollama.js";

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const translationQualityScorer = createScorer({
  id: "translation-quality",
  description:
    "Evaluates translation quality via embedding cosine similarity against reference",
})
  .preprocess(({ run }) => {
    const output = run.output as {
      translated: string;
      reference?: string;
      detectedLanguage: string;
    };
    return output;
  })
  .analyze(async ({ results }) => {
    const { translated, reference, detectedLanguage } =
      results.preprocessStepResult!;

    if (detectedLanguage === "en") {
      return { similarity: 1.0, skipped: true };
    }

    if (!reference) {
      return { similarity: 0.5, skipped: true };
    }

    const embeddings = await embedTexts([
      `search_document: ${translated}`,
      `search_document: ${reference}`,
    ]);

    return {
      similarity: cosineSim(embeddings[0]!, embeddings[1]!),
      skipped: false,
    };
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult!.similarity;
  })
  .generateReason(({ results, score }) => {
    const { skipped } = results.analyzeStepResult!;
    if (skipped) return `Score: ${score.toFixed(3)} (no translation needed or no reference)`;
    const pass = score > 0.85 ? "PASS" : "FAIL";
    return `[${pass}] Cosine similarity: ${score.toFixed(3)}`;
  });
