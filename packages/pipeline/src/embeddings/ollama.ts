import { getOllamaBaseUrl } from "../llm/ollama-generate.js";

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
  const baseUrl = getOllamaBaseUrl(options?.baseUrl);
  const model = options?.model ?? "nomic-embed-text";

  const singleChunkIndices: number[] = [];
  const singleChunkTexts: string[] = [];
  const multiChunkEntries: Array<{ index: number; chunks: string[] }> = [];

  for (let i = 0; i < texts.length; i++) {
    const chunks = chunkText(texts[i]!);
    if (chunks.length === 1) {
      singleChunkIndices.push(i);
      singleChunkTexts.push(chunks[0]!);
    } else {
      multiChunkEntries.push({ index: i, chunks });
    }
  }

  const results: number[][] = new Array(texts.length);

  if (singleChunkTexts.length > 0) {
    const batchEmbeddings = await rawEmbed(singleChunkTexts, model, baseUrl);
    for (let i = 0; i < singleChunkIndices.length; i++) {
      results[singleChunkIndices[i]!] = batchEmbeddings[i]!;
    }
  }

  for (const { index, chunks } of multiChunkEntries) {
    const chunkEmbeddings = await rawEmbed(chunks, model, baseUrl);
    results[index] = averageVectors(chunkEmbeddings);
  }

  return results;
}
