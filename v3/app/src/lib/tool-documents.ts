/**
 * Tool Documents — builds rich searchable text documents from tool metadata.
 *
 * Each document combines all available information about a tool into a single
 * text blob suitable for:
 *   1. Feeding to an LLM for semantic search / ranking
 *   2. Generating vector embeddings for similarity search
 *   3. Future RAG pipelines over docs and media
 */

import type { ToolWithMeta } from "./types";

export interface ToolDocument {
  /** AirTable record ID */
  id: string;
  /** Tool name (for display) */
  name: string;
  /** Rich text combining all metadata fields */
  text: string;
}

/**
 * Build a rich-text document for a single tool.
 * Concatenates all available metadata into a human-readable paragraph
 * so that both LLMs and embedding models can capture the full semantics.
 */
export function buildToolDocument(tool: ToolWithMeta): ToolDocument {
  const parts: string[] = [];

  parts.push(`${tool.name}: ${tool.description}`);

  parts.push(`Category: ${tool.category_group} — ${tool.category_sub}.`);
  parts.push(`Location: ${tool.location_room}, ${tool.location_zone}.`);

  if (tool.materials.length > 0) {
    parts.push(`Works with materials: ${tool.materials.join(", ")}.`);
  }

  if (tool.tags.length > 0) {
    parts.push(`Tags: ${tool.tags.join(", ")}.`);
  }

  if (tool.ppe_required.length > 0) {
    parts.push(`PPE required: ${tool.ppe_required.join(", ")}.`);
  }

  if (tool.training_required) {
    parts.push("Training is required before use.");
  }

  if (tool.authorized_only) {
    parts.push("Authorized users only.");
  }

  if (tool.use_restrictions) {
    parts.push(`Use restrictions: ${tool.use_restrictions}`);
  }

  if (tool.emergency_stop) {
    parts.push(`Emergency stop: ${tool.emergency_stop}`);
  }

  return {
    id: tool.id,
    name: tool.name,
    text: parts.join(" "),
  };
}

/**
 * Build documents for all tools.
 */
export function buildAllToolDocuments(tools: ToolWithMeta[]): ToolDocument[] {
  return tools.map(buildToolDocument);
}

/**
 * Build a compact index string suitable for sending to an LLM in a single prompt.
 * Each tool is one line with key attributes for efficient token usage.
 */
export function buildCompactIndex(tools: ToolWithMeta[]): string {
  return tools
    .map((t) => {
      const attrs: string[] = [
        t.category_group,
        t.category_sub,
      ];
      if (t.materials.length > 0) attrs.push(`materials: ${t.materials.join(", ")}`);
      if (t.tags.length > 0) attrs.push(`tags: ${t.tags.join(", ")}`);
      return `[${t.id}] ${t.name} (${attrs.join("; ")}) — ${t.description.slice(0, 150)}`;
    })
    .join("\n");
}
