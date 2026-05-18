import { stripHtml } from "../sync/content-hash.js";
import { EXTRACTION_PROMPT_V1 } from "../prompts/extraction-v1.js";

interface OllamaGenerateResponse {
  response: string;
}

export interface ExtractedEntities {
  skills: string[];
  technologies: string[];
  languages: string[];
  frameworks: string[];
  tools: string[];
  platforms: string[];
  methodologies: string[];
  soft_skills: string[];
  industry: string[];
}

const EXTRACTION_PROMPT = `You are an entity extraction system for job listings. The listing may be in Czech, English, or mixed — extract entities regardless of language but output entity names in English.

Return ONLY valid JSON (no markdown, no code fences) with these arrays (use empty arrays if none found):
{"skills":[],"technologies":[],"languages":[],"frameworks":[],"tools":[],"platforms":[],"methodologies":[],"soft_skills":[],"industry":[]}

Category guide:
- skills: technical skills (SQL, REST API design, data modeling, machine learning)
- technologies: specific technologies (Kubernetes, Docker, PostgreSQL, Redis)
- languages: programming languages (Python, TypeScript, Java, Go, C++)
- frameworks: frameworks and libraries (React, Next.js, Django, Spring Boot, .NET)
- tools: developer tools (Git, Jira, Figma, VS Code, Webpack)
- platforms: cloud/SaaS platforms (AWS, GCP, Azure, Vercel, Shopify)
- methodologies: development methodologies (Agile, Scrum, TDD, CI/CD, DevOps)
- soft_skills: soft skills (leadership, communication, teamwork, problem-solving)
- industry: business domains (fintech, healthtech, e-commerce, AI/ML, cybersecurity)

Rules:
- Always output in English even if input is Czech
- Normalize: "ReactJS"→"React", "k8s"→"Kubernetes", "JS"→"JavaScript"
- Be specific, deduplicate, only extract explicitly mentioned items

Job listing:
`;

export async function extractEntities(
  title: string,
  description: string,
  company: string,
  options?: { baseUrl?: string; model?: string },
): Promise<ExtractedEntities> {
  const baseUrl =
    options?.baseUrl ??
    process.env["OLLAMA_BASE_URL"] ??
    "http://localhost:11434";
  const model = options?.model ?? EXTRACTION_PROMPT_V1.model;

  const cleanDesc = stripHtml(description).slice(0, 4000);
  const prompt = `${EXTRACTION_PROMPT_V1.prompt}Title: ${title}\nCompany: ${company}\nDescription: ${cleanDesc}`;

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 1024 },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Ollama generate failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  return parseExtraction(data.response);
}

function parseExtraction(text: string): ExtractedEntities {
  const empty: ExtractedEntities = {
    skills: [],
    technologies: [],
    languages: [],
    frameworks: [],
    tools: [],
    platforms: [],
    methodologies: [],
    soft_skills: [],
    industry: [],
  };

  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return empty;

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const result = { ...empty };
    for (const key of Object.keys(empty) as (keyof ExtractedEntities)[]) {
      const val = parsed[key];
      if (Array.isArray(val)) {
        result[key] = val
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      }
    }
    return result;
  } catch {
    return empty;
  }
}
