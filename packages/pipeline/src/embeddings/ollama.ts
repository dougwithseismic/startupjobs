interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 500;

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + CHUNK_SIZE));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function averageVectors(vectors: number[][]): number[] {
  const dims = vectors[0]!.length;
  const avg = new Array<number>(dims).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dims; i++) {
      avg[i]! += vec[i]!;
    }
  }
  for (let i = 0; i < dims; i++) {
    avg[i]! /= vectors.length;
  }
  return avg;
}

async function rawEmbed(
  texts: string[],
  model: string,
  baseUrl: string,
): Promise<number[][]> {
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Ollama embed failed: ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = (await response.json()) as OllamaEmbedResponse;
  return data.embeddings;
}

export async function embedTexts(
  texts: string[],
  options?: { model?: string; baseUrl?: string },
): Promise<number[][]> {
  const baseUrl =
    options?.baseUrl ??
    process.env["OLLAMA_BASE_URL"] ??
    "http://localhost:11434";
  const model = options?.model ?? "nomic-embed-text";

  const results: number[][] = [];

  for (const text of texts) {
    const chunks = chunkText(text);

    if (chunks.length === 1) {
      const [embedding] = await rawEmbed(chunks, model, baseUrl);
      results.push(embedding!);
    } else {
      const chunkEmbeddings = await rawEmbed(chunks, model, baseUrl);
      results.push(averageVectors(chunkEmbeddings));
    }
  }

  return results;
}
