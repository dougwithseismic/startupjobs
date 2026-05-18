export interface OllamaGenerateResponse {
  response: string;
}

export interface GenerateOptions {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export function getOllamaBaseUrl(override?: string): string {
  return (
    override ?? process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434"
  );
}

export async function ollamaGenerate(
  prompt: string,
  options?: GenerateOptions,
): Promise<string> {
  const baseUrl = getOllamaBaseUrl(options?.baseUrl);
  const model = options?.model ?? "gemma4";

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0,
        num_predict: options?.maxTokens ?? 1024,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Ollama generate failed: ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = (await response.json()) as OllamaGenerateResponse;
  return data.response;
}

export function parseLlmJson<T>(text: string): T | null {
  const cleaned = text
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  // Try direct parse first
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    // Repair common LLM JSON issues: unescaped control chars inside strings
    const repaired = match[0]
      .replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === "\n") return "\\n";
        if (ch === "\r") return "\\r";
        if (ch === "\t") return "\\t";
        return "";
      });
    try {
      return JSON.parse(repaired) as T;
    } catch {
      return null;
    }
  }
}
