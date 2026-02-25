/**
 * Vector Store — lightweight embedding-based similarity search.
 *
 * Designed as the foundation for a full vector DB over tool docs and media.
 * With only ~101 tools the index fits comfortably in memory, so no external
 * vector DB is needed yet. The architecture is ready to swap in Voyage AI,
 * pgvector, or Pinecone when the corpus grows to include PDFs, SOPs, and
 * video transcripts.
 *
 * Embedding generation is handled by a separate build script
 * (scripts/generate-embeddings.ts) and stored in data/airtable/embeddings.json.
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────

export interface EmbeddingRecord {
  /** AirTable record ID */
  id: string;
  /** Tool name (for debugging / display) */
  name: string;
  /** The text that was embedded */
  text: string;
  /** The embedding vector */
  vector: number[];
}

export interface EmbeddingIndex {
  /** Model used to generate these embeddings */
  model: string;
  /** Dimension of each vector */
  dimension: number;
  /** When the index was generated */
  generated_at: string;
  /** Individual tool embeddings */
  records: EmbeddingRecord[];
}

export interface SearchResult {
  id: string;
  name: string;
  score: number;
}

// ── Math helpers ──────────────────────────────────────────────────────

/** Cosine similarity between two vectors. Returns value in [-1, 1]. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Index loading ─────────────────────────────────────────────────────

let cachedIndex: EmbeddingIndex | null = null;

/**
 * Try to load pre-computed embeddings from the data directory.
 * Returns null if the file doesn't exist yet (embeddings haven't been generated).
 */
export async function loadEmbeddingIndex(): Promise<EmbeddingIndex | null> {
  if (cachedIndex) return cachedIndex;

  try {
    // Dynamic import of the JSON file — works in Node.js / Next.js server
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "data", "airtable", "embeddings.json");
    const raw = await fs.readFile(filePath, "utf-8");
    cachedIndex = JSON.parse(raw) as EmbeddingIndex;
    return cachedIndex;
  } catch {
    // File doesn't exist yet — that's fine, fall back to LLM search
    return null;
  }
}

/**
 * Search the embedding index for tools similar to a query vector.
 */
export function searchByVector(
  index: EmbeddingIndex,
  queryVector: number[],
  topK: number = 10,
  threshold: number = 0.3
): SearchResult[] {
  const scored = index.records.map((record) => ({
    id: record.id,
    name: record.name,
    score: cosineSimilarity(queryVector, record.vector),
  }));

  return scored
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Embedding generation (Google text-embedding-004) ──────────────────

const GOOGLE_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * Generate an embedding for a single text using Google's text-embedding-004 model.
 * Returns null if the API key isn't configured.
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!GOOGLE_API_KEY) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GOOGLE_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.embedding?.values ?? null;
}

/**
 * Generate embeddings for multiple texts in batch.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  if (!GOOGLE_API_KEY) return texts.map(() => null);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${GOOGLE_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: "models/text-embedding-004",
        content: { parts: [{ text }] },
      })),
    }),
  });

  if (!res.ok) return texts.map(() => null);

  const data = await res.json();
  return (data?.embeddings ?? []).map(
    (e: { values?: number[] }) => e?.values ?? null
  );
}
