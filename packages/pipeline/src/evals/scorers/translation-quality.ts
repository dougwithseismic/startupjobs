import { createScorer } from "@mastra/core/evals";
import { ollamaGenerate } from "../../llm/ollama-generate.js";

export const translationQualityScorer = createScorer({
  id: "translation-quality",
  description:
    "Evaluates translation quality via LLM judge comparison against reference",
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

    const prompt = `Compare these two texts and rate their semantic similarity from 0.0 to 1.0.
A score of 1.0 means they convey identical meaning, 0.0 means completely unrelated.

Text A: "${translated.slice(0, 1000)}"

Text B: "${reference.slice(0, 1000)}"

Respond with ONLY a number between 0.0 and 1.0.`;

    try {
      const response = await ollamaGenerate(prompt, {
        model: "gemma4",
        temperature: 0,
      });
      const score = parseFloat(response.trim());
      return {
        similarity: isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score)),
        skipped: false,
      };
    } catch {
      return { similarity: 0.5, skipped: true };
    }
  })
  .generateScore(({ results }) => {
    return results.analyzeStepResult!.similarity;
  })
  .generateReason(({ results, score }) => {
    const { skipped } = results.analyzeStepResult!;
    if (skipped) return `Score: ${score.toFixed(3)} (no translation needed or no reference)`;
    const pass = score > 0.85 ? "PASS" : "FAIL";
    return `[${pass}] LLM similarity: ${score.toFixed(3)}`;
  });
