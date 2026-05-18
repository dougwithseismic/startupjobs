import { buildTaxonomyPromptBlock } from "../knowledge/taxonomy.js";

const taxonomyBlock = buildTaxonomyPromptBlock();

export const TRANSLATE_EXTRACT_PROMPT_V1 = {
  version: "1",
  model: "gemma4" as const,
  description: "Combined language detection, translation, and entity extraction with constrained taxonomy",
  prompt: `Analyze this job listing. Return JSON only, no markdown.

TASK 1 — Detect language (ISO 639-1), translate title to English, summarize description in 1-3 English sentences.

TASK 2 — Extract entities. ONLY pick items from the valid lists below. Empty array if nothing matches.

${taxonomyBlock}

For skills and soft_skills: extract free-text but ONLY skills actually stated in the listing.
For industry: extract the business domain from context (fintech, healthtech, e-commerce, AI/ML, cybersecurity, etc.)

RULES:
- ONLY extract what is EXPLICITLY mentioned in the listing text
- If an item is not in the valid lists above, do NOT include it
- A non-technical role must have empty languages/frameworks/technologies arrays
- spokenLanguages: use ISO codes from the list above

{"detectedLanguage":"","titleEn":"","descriptionEn":"","skills":[],"technologies":[],"languages":[],"spokenLanguages":[],"frameworks":[],"tools":[],"platforms":[],"methodologies":[],"soft_skills":[],"industry":[]}

Job listing:
`,
} as const;
