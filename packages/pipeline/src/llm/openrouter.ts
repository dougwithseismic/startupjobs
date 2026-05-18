export interface OpenRouterOptions {
  model?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-001";

export function getOpenRouterApiKey(override?: string): string {
  const key = override ?? process.env["OPENROUTER_API_KEY"];
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return key;
}

export async function openRouterGenerate(
  prompt: string,
  options?: OpenRouterOptions,
): Promise<string> {
  const apiKey = getOpenRouterApiKey(options?.apiKey);
  const model = options?.model ?? DEFAULT_MODEL;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens ?? 2048,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter failed: ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  if (data.usage) {
    const cost =
      (data.usage.prompt_tokens / 1_000_000) * 0.075 +
      (data.usage.completion_tokens / 1_000_000) * 0.3;
    console.log(
      `  [${model}] ${data.usage.prompt_tokens}in/${data.usage.completion_tokens}out ~$${cost.toFixed(5)}`,
    );
  }

  return data.choices[0]?.message?.content ?? "";
}
