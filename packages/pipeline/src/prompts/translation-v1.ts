export const TRANSLATION_PROMPT_V1 = {
  version: "1",
  model: "gemma4",
  description: "Language detection and Czech→English translation for job listings",
  prompt: `You are a translation and language detection system. Analyze the job listing below.

1. Detect the language: "cs" (Czech), "en" (English), or "mixed"
2. If Czech or mixed, translate the title and description to English
3. If already English, return them unchanged

Return ONLY valid JSON (no markdown, no code fences):
{"detectedLanguage":"cs","titleEn":"English title here","descriptionEn":"English description here"}

Keep the translation natural and professional. Preserve technical terms (React, Python, etc.) as-is.

Job listing:
`,
} as const;

export type TranslationPrompt = typeof TRANSLATION_PROMPT_V1;
