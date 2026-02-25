import {
  fetchAllTools,
  fetchAllCategories,
  fetchAllLocations,
  resolveTools,
} from "@/lib/airtable";
import { buildCompactIndex } from "@/lib/tool-documents";
import {
  loadEmbeddingIndex,
  searchByVector,
  embedText,
} from "@/lib/vector-store";
import { rateLimitAsync, getClientIp } from "@/lib/rate-limit";

export const maxDuration = 30;

interface NLSearchResult {
  /** Matched tool IDs ordered by relevance */
  toolIds: string[];
  /** Short explanation of why these tools match */
  reasoning: string;
  /** Suggested filters the user could apply instead */
  suggestedFilters?: {
    categories?: string[];
    materials?: string[];
    rooms?: string[];
  };
  /** Which search method was used */
  method: "vector" | "llm";
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed } = await rateLimitAsync(`nl-search:${ip}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!allowed) {
    return Response.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || query.length > 500) {
      return Response.json({ error: "Invalid query" }, { status: 400 });
    }

    // Load tools for both search paths
    const [tools, categories, locations] = await Promise.all([
      fetchAllTools(),
      fetchAllCategories(),
      fetchAllLocations(),
    ]);
    const resolved = resolveTools(tools, categories, locations);

    // ── Try vector search first ────────────────────────────────────
    const embeddingIndex = await loadEmbeddingIndex();
    if (embeddingIndex) {
      const queryVector = await embedText(query);
      if (queryVector) {
        const vectorResults = searchByVector(
          embeddingIndex,
          queryVector,
          15,
          0.25
        );

        if (vectorResults.length > 0) {
          // Build reasoning from top matches
          const topNames = vectorResults
            .slice(0, 5)
            .map((r) => r.name)
            .join(", ");

          const result: NLSearchResult = {
            toolIds: vectorResults.map((r) => r.id),
            reasoning: `Found ${vectorResults.length} tools matching "${query}". Top matches: ${topNames}.`,
            method: "vector",
          };

          return Response.json(result);
        }
      }
    }

    // ── Fall back to Claude LLM search ─────────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return Response.json(
        { error: "Search is not configured" },
        { status: 503 }
      );
    }

    const compactIndex = buildCompactIndex(resolved);

    const systemPrompt = `You are a search engine for the Cornell MakerLab tool inventory. Given a natural language question about tools, find the most relevant tools from the inventory.

## Tool Inventory
${compactIndex}

## Instructions
- Analyze the user's question to understand what they need.
- Return the IDs of relevant tools, ordered by relevance (most relevant first).
- Also suggest any filters (categories, materials, rooms) that would help narrow results.
- If the question is about a specific task (e.g., "making holes in wood"), think about which tools can accomplish that task.
- Return between 1 and 15 tool IDs. Prefer precision over recall — only include genuinely relevant tools.
- Provide a short (1-2 sentence) reasoning explaining your selection.

## Response Format
Respond with ONLY a JSON object (no markdown fencing):
{
  "toolIds": ["id1", "id2", ...],
  "reasoning": "Brief explanation of why these tools match",
  "suggestedFilters": {
    "categories": ["Category Name"],
    "materials": ["Material Name"],
    "rooms": ["Room Name"]
  }
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: query }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Claude API error: ${response.status} ${body}`);
      return Response.json(
        { error: "Search temporarily unavailable" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const text =
      data.content?.[0]?.type === "text" ? data.content[0].text : "";

    // Parse the JSON response — handle both raw JSON and markdown-fenced JSON
    let parsed: {
      toolIds?: string[];
      reasoning?: string;
      suggestedFilters?: {
        categories?: string[];
        materials?: string[];
        rooms?: string[];
      };
    };
    try {
      const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, try to extract IDs from the text
      console.error("Failed to parse Claude response:", text);
      return Response.json(
        { error: "Search produced an invalid result" },
        { status: 500 }
      );
    }

    // Validate tool IDs exist in our data
    const validIds = new Set(resolved.map((t) => t.id));
    const matchedIds = (parsed.toolIds || []).filter((id) => validIds.has(id));

    const result: NLSearchResult = {
      toolIds: matchedIds,
      reasoning: parsed.reasoning || "Here are the tools that match your query.",
      suggestedFilters: parsed.suggestedFilters,
      method: "llm",
    };

    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    console.error("NL search error:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
