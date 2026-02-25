#!/usr/bin/env node

/**
 * Generate vector embeddings for all tools and save to data/airtable/embeddings.json.
 *
 * Uses Google's text-embedding-004 model (same API key as Gemini image generation).
 * Run this after syncing tool data to keep the vector index up to date.
 *
 * Usage:
 *   node scripts/generate-embeddings.mjs
 *
 * Requires GEMINI_API_KEY in .env.local (or environment).
 */

import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data", "airtable");

// ── Load environment ─────────────────────────────────────────────────

// Try to load .env.local
async function loadEnv() {
  try {
    const envPath = join(ROOT, ".env.local");
    const content = await readFile(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local doesn't exist, rely on environment variables
  }
}

await loadEnv();

const GOOGLE_API_KEY = process.env.GEMINI_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error("Error: GEMINI_API_KEY not found in .env.local or environment");
  process.exit(1);
}

// ── Load tool data ───────────────────────────────────────────────────

async function loadTools() {
  const raw = await readFile(join(DATA_DIR, "tools.json"), "utf-8");
  const { records } = JSON.parse(raw);

  const catRaw = await readFile(join(DATA_DIR, "categories.json"), "utf-8");
  const { records: categories } = JSON.parse(catRaw);
  const catMap = new Map(categories.map((c) => [c.id, c.fields]));

  const locRaw = await readFile(join(DATA_DIR, "locations.json"), "utf-8");
  const { records: locations } = JSON.parse(locRaw);
  const locMap = new Map(locations.map((l) => [l.id, l.fields]));

  return records.map((tool) => {
    const catId = tool.fields.category?.[0];
    const locId = tool.fields.location?.[0];
    const cat = catId ? catMap.get(catId) : undefined;
    const loc = locId ? locMap.get(locId) : undefined;

    const parts = [];
    parts.push(`${tool.fields.name}: ${tool.fields.description || ""}`);
    parts.push(`Category: ${cat?.group || "Uncategorized"} — ${cat?.name || "Other"}.`);
    parts.push(`Location: ${loc?.room || "Unknown"}, ${loc?.name || "Unknown"}.`);

    if (tool.fields.materials?.length > 0) {
      parts.push(`Works with materials: ${tool.fields.materials.join(", ")}.`);
    }
    if (tool.fields.tags?.length > 0) {
      parts.push(`Tags: ${tool.fields.tags.join(", ")}.`);
    }
    if (tool.fields.ppe_required?.length > 0) {
      parts.push(`PPE required: ${tool.fields.ppe_required.join(", ")}.`);
    }
    if (tool.fields.training_required) {
      parts.push("Training is required before use.");
    }
    if (tool.fields.authorized_only) {
      parts.push("Authorized users only.");
    }
    if (tool.fields.use_restrictions) {
      parts.push(`Use restrictions: ${tool.fields.use_restrictions}`);
    }

    return {
      id: tool.id,
      name: tool.fields.name,
      text: parts.join(" "),
    };
  });
}

// ── Generate embeddings via Google API ───────────────────────────────

async function batchEmbed(texts, batchSize = 100) {
  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${GOOGLE_API_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        })),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Embedding API ${res.status}: ${body}`);
    }

    const data = await res.json();
    const embeddings = data.embeddings.map((e) => e.values);
    results.push(...embeddings);

    if (i + batchSize < texts.length) {
      // Respect rate limits
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Loading tool data...");
  const tools = await loadTools();
  console.log(`Found ${tools.length} tools.`);

  console.log("Generating embeddings with text-embedding-004...");
  const texts = tools.map((t) => t.text);
  const vectors = await batchEmbed(texts);

  const index = {
    model: "text-embedding-004",
    dimension: vectors[0]?.length || 768,
    generated_at: new Date().toISOString(),
    records: tools.map((t, i) => ({
      id: t.id,
      name: t.name,
      text: t.text,
      vector: vectors[i],
    })),
  };

  const outPath = join(DATA_DIR, "embeddings.json");
  await writeFile(outPath, JSON.stringify(index, null, 2));
  console.log(`Saved ${index.records.length} embeddings to ${outPath}`);
  console.log(`Dimension: ${index.dimension}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
