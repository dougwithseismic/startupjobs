# StartupJobs Search Pipeline

A vectorless job search engine built on knowledge graphs, BM25 full-text search, and structured data scoring. No vector embeddings, no HNSW indexes, no cosine similarity.

## Why Vectorless?

The 2024-2025 era defaulted to vector embeddings for everything. Embed your documents, store them in Pinecone/pgvector, do cosine similarity, done. But for structured, short-form data like job listings, this approach has real problems:

- **Similarity != relevance.** Cosine distance tells you two things are topically close, not that one answers the other. A Python job and a "we use Python internally" marketing job score the same.
- **Black box retrieval.** When search results are wrong, you can't debug why. The embedding space is opaque.
- **Infrastructure cost.** Embedding models, vector indexes, re-indexing on model upgrades, GPU compute for query-time embedding. All for marginal gains over BM25 on short documents.
- **Knowledge graphs are the actual signal.** A job listing's meaning lives in its structured relationships: what skills it requires, what technologies it uses, what seniority it targets. These are explicit, debuggable, and composable.

This project implements the "vectorless RAG" approach that's gaining traction in 2026: lean into the knowledge graph you already have, combine it with proper full-text search, and use LLMs for extraction and reranking rather than embedding.

## Architecture

```
                    StartupJobs.cz API
                          │
                    ┌─────▼─────┐
                    │   Crawl   │  Paginated fetch, hash-based change detection
                    └─────┬─────┘
                          │
                    ┌─────▼─────┐
                    │  Extract  │  Single-pass translate + entity extraction
                    │  (LLM)   │  Taxonomy-constrained, zero hallucination
                    └─────┬─────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        ┌──────────┐ ┌────────┐ ┌──────────┐
        │ job_     │ │entities│ │  job_    │
        │ listings │ │  (KG)  │ │ entities │
        └────┬─────┘ └───┬────┘ └────┬─────┘
             │           │           │
        ┌────▼───────────▼───────────▼────┐
        │         Vectorless Search        │
        │                                  │
        │  BM25 (weighted fields)   0.35   │
        │  KG entity overlap        0.35   │
        │  Structured data match    0.20   │
        │  Query expansion          0.10   │
        │  ────────────────────────────    │
        │  Optional: LLM reranker          │
        └──────────────────────────────────┘
```

### Pipeline (2 steps, no embedding)

1. **Crawl & Upsert** — Fetches job listings from the StartupJobs.cz API. Uses SHA256 content hashing to detect changes and skip unchanged listings.

2. **Translate & Extract** — A single LLM call per job that:
   - Detects the listing language (ISO 639-1)
   - Translates title to English, summarizes description in 1-3 sentences
   - Extracts entities into the knowledge graph using a **constrained taxonomy** (the LLM can only pick from predefined lists of technologies, frameworks, tools, etc. — no hallucination)

### Search (3-channel fusion)

Search combines three independent scoring channels via weighted Reciprocal Rank Fusion (RRF):

| Channel | Weight | How it works |
|---------|--------|-------------|
| **BM25 Full-Text** | 0.35 | PostgreSQL `ts_rank_cd` with field weights: title (A), company (B), description (D). Uses English-translated content. |
| **Knowledge Graph** | 0.35 | Matches query terms against entity names in the KG. Scores by entity type weight (technology 3x, skill 3x, framework 2.5x) and relation type (requires 1.0, prefers 0.7, etc.). |
| **Structured Data** | 0.20 | Seniority match, remote preference, location containment, salary range overlap. |
| **Query Expansion** | 0.10 | Auto-detects seniority/remote/salary signals from natural language queries. |

An optional **LLM reranker** can re-score the top candidates using local Ollama for a final relevance pass.

## Knowledge Graph

The KG is the core differentiator. Each job listing is connected to typed entities with weighted relationships:

```
[Job: "Senior React Developer"]
    ──requires──▶ [technology: React]
    ──requires──▶ [language: TypeScript]
    ──requires──▶ [framework: Next.js]
    ──prefers───▶ [tool: Docker]
    ──requires──▶ [spoken_language: en]
    ──requires──▶ [spoken_language: cs]
    ──belongs_to─▶ [industry: fintech]
```

### Entity types

`skill`, `technology`, `language` (programming), `spoken_language` (human, ISO 639-1), `framework`, `tool`, `platform`, `methodology`, `certification`, `soft_skill`, `industry`

### Taxonomy-constrained extraction

The LLM doesn't freestyle. It receives a curated taxonomy of ~300 valid entities per category (defined in `taxonomy.ts`) and is instructed to **only pick from those lists**. This eliminates hallucination — a Finance Director job won't get tagged with Kubernetes.

Free-text categories (`skills`, `soft_skills`, `industry`) are still open-ended since they're too varied to enumerate, but these are low-risk for search poisoning.

### Keeping the KG fresh

The knowledge graph is only as good as its last extraction run. Things that go stale:

- **New jobs** — The crawl runs on a schedule and picks up new listings automatically. New jobs get extracted on the next sync.
- **Taxonomy drift** — New technologies emerge (a new framework, a new cloud platform). The taxonomy in `taxonomy.ts` needs periodic updates. If it's not in the list, it won't be extracted.
- **Extraction quality** — LLM behavior changes between model versions. When switching models, re-extract a sample and validate against the hallucination detector (`debug-parse.ts`).
- **Entity normalization** — Currently basic regex. "ReactJS" and "React.js" normalize to the same entity, but edge cases exist. A fuzzy matching layer (pg_trgm) would help.

**Recommendation:** Run the full pipeline weekly. Keep an eye on the taxonomy. When adding new valid entities, you don't need to re-extract everything — just add them to the list and they'll be picked up for new jobs.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Monorepo | Turborepo + pnpm |
| Database | PostgreSQL 18 (TimescaleDB) |
| ORM | Drizzle |
| LLM (extraction) | Llama 4 Scout via OpenRouter (~$0.10/full run) |
| LLM (reranker) | Ollama gemma4 (local, optional) |
| Search | PostgreSQL full-text + custom KG scoring + RRF fusion |
| Frontend | Next.js 16 + Sigma.js knowledge graph visualization |
| API client | Custom TypeScript client for StartupJobs.cz |
| Eval | Mastra evals (NDCG, Precision@K, MRR) + golden dataset |

## Quick Start

```bash
# Prerequisites: Docker, Node.js 18+, pnpm

# 1. Start the database
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Push the schema
pnpm --filter @repo/pipeline exec drizzle-kit push

# 4. Run the full pipeline (crawl + extract)
pnpm --filter @repo/pipeline sync

# 5. Search
pnpm --filter @repo/pipeline search "react developer"
pnpm --filter @repo/pipeline search "senior python remote"
pnpm --filter @repo/pipeline search "frontend" --tech docker --industry fintech
pnpm --filter @repo/pipeline search "backend engineer" --seniority senior --remote --rerank
```

## Environment Variables

```bash
# .env
DATABASE_URL=postgresql://startupjobs:startupjobs@localhost:5434/startupjobs
OLLAMA_BASE_URL=http://localhost:11434        # For local LLM reranker
OPENROUTER_API_KEY=sk-or-v1-...               # For extraction via OpenRouter
```

## Project Structure

```
packages/
  pipeline/
    src/
      crawler/          # StartupJobs API crawling
      db/               # Drizzle schema + connection
      knowledge/        # Entity extraction, storage, taxonomy
      llm/              # Ollama + OpenRouter clients
      prompts/          # LLM prompt templates
      search/           # Vectorless search engine
        hybrid-search   #   Main search function (3-channel RRF)
        kg-search       #   Knowledge graph retrieval
        structured-score#   Seniority/remote/location/salary scoring
        query-parser    #   NL query decomposition
        fusion          #   Weighted RRF implementation
        reranker        #   Optional LLM reranking
      sync/             # Pipeline orchestration
      scripts/          # CLI tools (search, benchmark, debug)
      evals/            # Search quality + extraction accuracy evals
  startupjobs-api/      # TypeScript API client for StartupJobs.cz
apps/
  web/                  # Next.js frontend with KG visualization
  docs/                 # Documentation (placeholder)
```

## Model Benchmarks

We tested multiple models for the taxonomy-constrained extraction task on the same 5 job listings:

| Model | Avg/job | Parse rate | Hallucinations | Cost/job |
|-------|---------|-----------|----------------|----------|
| **Llama 4 Scout** (OpenRouter) | 3.0s | 5/5 | **0** | $0.0002 |
| Gemini 2.0 Flash (OpenRouter) | 3.0s | 5/5 | 6 | $0.0002 |
| gemma4 8B (local Ollama) | 15s | 5/5 | ~3 | free |
| DeepSeek V3 (OpenRouter) | 11.3s | 5/5 | 31 | $0.0003 |
| gemma3:4b (local Ollama) | 10s | 5/5 | **hundreds** | free |

gemma3:4b dumps the entire taxonomy into every response. It can't distinguish "pick from this list" from "include this list." Llama 4 Scout follows constrained selection perfectly.

## What We Dropped

- `nomic-embed-text` — No longer needed. Was generating 768-dim vectors for every job.
- `pgvector` extension — No HNSW index, no vector column, no cosine distance operators.
- Embedding pipeline stage — The sync pipeline went from 3 steps to 2.
- ~500 lines of embedding infrastructure code.

## What's Next

- [ ] Search UI — The hybrid search supports all the filters, but there's no web query builder yet
- [ ] Query result caching — Every search re-runs the full scoring pipeline
- [ ] Fuzzy entity matching — `pg_trgm` for handling typos and near-matches in KG queries
- [ ] Incremental re-extraction — When the taxonomy updates, only re-extract affected entity types
- [ ] A/B eval — Automated comparison of search quality across model/prompt changes
- [ ] Personalization — User skill profiles matched against the KG for recommendations
