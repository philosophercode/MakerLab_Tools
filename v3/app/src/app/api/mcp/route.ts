import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { fetchDocContent } from "@/lib/doc-fetcher";
import {
  fetchAllTools,
  fetchTool,
  fetchAllCategories,
  fetchAllLocations,
  fetchAllUnits,
  fetchUnit,
  fetchUnitsByTool,
  fetchMaintenanceLogsByUnit,
  createMaintenanceLog,
  resolveTools,
} from "@/lib/airtable";
import { evaluateImage, toolToImageInfo } from "@/lib/eval-images";
import { generateImage } from "@/lib/gemini-image";
import type { ToolRecord, CategoryRecord, LocationRecord, ToolWithMeta, MaintenancePriority } from "@/lib/types";
import { rateLimitAsync, getClientIp } from "@/lib/rate-limit";

// ── Helpers ────────────────────────────────────────────────────────

let categoryCache: CategoryRecord[] | null = null;
let locationCache: LocationRecord[] | null = null;

async function getResolved(filters?: {
  category?: string;
  location?: string;
}): Promise<ToolWithMeta[]> {
  const [tools, categories, locations] = await Promise.all([
    fetchAllTools(),
    categoryCache ? Promise.resolve(categoryCache) : fetchAllCategories().then((c) => { categoryCache = c; return c; }),
    locationCache ? Promise.resolve(locationCache) : fetchAllLocations().then((l) => { locationCache = l; return l; }),
  ]);

  let resolved = resolveTools(tools, categories, locations);

  if (filters?.category) {
    const cat = filters.category.toLowerCase();
    resolved = resolved.filter(
      (t) =>
        t.category_group.toLowerCase().includes(cat) ||
        t.category_sub.toLowerCase().includes(cat)
    );
  }
  if (filters?.location) {
    const loc = filters.location.toLowerCase();
    resolved = resolved.filter(
      (t) =>
        t.location_room.toLowerCase().includes(loc) ||
        t.location_zone.toLowerCase().includes(loc)
    );
  }

  return resolved;
}

async function findToolByName(name: string): Promise<ToolRecord | null> {
  const tools = await fetchAllTools();
  return tools.find((t) => t.fields.name.toLowerCase() === name.toLowerCase()) || null;
}

// ── Server factory ─────────────────────────────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "makerlab", version: "1.0.0" });

  server.registerTool("list_tools", {
    description: "List all tools in the MakerLab inventory. Returns name, category, location, and whether the tool has an image.",
    inputSchema: {
      category: z.string().optional().describe("Filter by category (partial match)"),
      location: z.string().optional().describe("Filter by location (partial match)"),
    },
  }, async ({ category, location }) => {
    const tools = await getResolved({ category, location });
    const lines = tools.map(
      (t) => `${t.name} | ${t.category_group} > ${t.category_sub} | ${t.location_room} / ${t.location_zone} | image: ${t.image_url ? "yes" : "no"}`
    );
    return { content: [{ type: "text", text: `Found ${tools.length} tools:\n\n${lines.join("\n")}` }] };
  });

  server.registerTool("get_tool", {
    description: "Get full details for a tool by name or AirTable record ID.",
    inputSchema: {
      name_or_id: z.string().describe("Tool name or AirTable record ID (recXXX)"),
    },
  }, async ({ name_or_id }) => {
    let tool: ToolWithMeta | undefined;

    if (name_or_id.startsWith("rec")) {
      try {
        const record = await fetchTool(name_or_id);
        const resolved = await getResolved();
        tool = resolved.find((t) => t.id === record.id);
      } catch { /* fall through */ }
    }

    if (!tool) {
      const resolved = await getResolved();
      tool = resolved.find((t) => t.name.toLowerCase() === name_or_id.toLowerCase());
    }

    if (!tool) return { content: [{ type: "text", text: `Tool not found: ${name_or_id}` }], isError: true };
    return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }] };
  });

  server.registerTool("search_tools", {
    description: "Keyword search across tool names, descriptions, materials, and tags.",
    inputSchema: { query: z.string().describe("Search keyword or phrase") },
  }, async ({ query }) => {
    const q = query.toLowerCase();
    const resolved = await getResolved();
    const results = resolved.filter((t) =>
      [t.name, t.description, ...t.materials, ...t.tags].join(" ").toLowerCase().includes(q)
    );
    if (results.length === 0) return { content: [{ type: "text", text: `No tools found matching "${query}"` }] };
    const summary = results.map((t) => `- ${t.name}: ${t.description.slice(0, 100)}${t.description.length > 100 ? "..." : ""}`).join("\n");
    return { content: [{ type: "text", text: `Found ${results.length} tools:\n\n${summary}` }] };
  });

  server.registerTool("list_units", {
    description: "List all units with status and condition. Optionally filter by tool name.",
    inputSchema: { tool_name: z.string().optional().describe("Filter by tool name") },
  }, async ({ tool_name }) => {
    let units;
    if (tool_name) {
      const tool = await findToolByName(tool_name);
      if (!tool) return { content: [{ type: "text", text: `Tool not found: ${tool_name}` }] };
      units = await fetchUnitsByTool(tool.id);
    } else {
      units = await fetchAllUnits();
    }

    if (units.length === 0) return { content: [{ type: "text", text: tool_name ? `No units for "${tool_name}"` : "No units found" }] };

    const lines = units.map((u) =>
      `${u.fields.unit_label} | status: ${u.fields.status || "Unknown"} | condition: ${u.fields.condition || "Unknown"}`
    );
    return { content: [{ type: "text", text: `Found ${units.length} units:\n\n${lines.join("\n")}` }] };
  });

  server.registerTool("get_unit", {
    description: "Get full details for a unit by label or record ID. Includes maintenance history and parent tool's SOP, safety doc, and video URLs.",
    inputSchema: { label_or_id: z.string().describe("Unit label or AirTable record ID") },
  }, async ({ label_or_id }) => {
    let unit;
    if (label_or_id.startsWith("rec")) {
      try { unit = await fetchUnit(label_or_id); } catch { /* fall through */ }
    }
    if (!unit) {
      const all = await fetchAllUnits();
      unit = all.find((u) => u.fields.unit_label.toLowerCase() === label_or_id.toLowerCase());
    }
    if (!unit) return { content: [{ type: "text", text: `Unit not found: ${label_or_id}` }], isError: true };

    // Fetch parent tool for SOP/safety/video URLs
    const toolId = unit.fields.tool?.[0];
    let parentTool: ToolWithMeta | undefined;
    if (toolId) {
      const resolved = await getResolved();
      parentTool = resolved.find((t) => t.id === toolId);
    }

    const logs = await fetchMaintenanceLogsByUnit(unit.id);
    const result = {
      ...unit.fields,
      id: unit.id,
      tool_name: parentTool?.name || "Unknown",
      sop_url: parentTool?.sop_url || null,
      safety_doc_url: parentTool?.safety_doc_url || null,
      video_url: parentTool?.video_url || null,
      training_required: parentTool?.training_required || false,
      authorized_only: parentTool?.authorized_only || false,
      maintenance_logs: logs.map((l) => ({
        id: l.id,
        title: l.fields.title,
        type: l.fields.type || "",
        priority: l.fields.priority || "",
        status: l.fields.status || "",
        date_reported: l.fields.date_reported || "",
        description: l.fields.description || "",
      })),
    };
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("create_maintenance_log", {
    description: "Create a maintenance log entry for a unit.",
    inputSchema: {
      title: z.string().describe("Short title for the issue"),
      unit_label: z.string().describe("Unit label (e.g. 'Form 2 #1')"),
      type: z.enum(["Issue Report", "Preventive Maintenance", "Repair", "Inspection", "Calibration"]).optional(),
      priority: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
      reported_by: z.string().optional(),
      description: z.string().optional(),
    },
  }, async (args) => {
    const all = await fetchAllUnits();
    const unit = all.find((u) => u.fields.unit_label.toLowerCase() === args.unit_label.toLowerCase());
    if (!unit) return { content: [{ type: "text", text: `Unit not found: ${args.unit_label}` }], isError: true };

    try {
      const record = await createMaintenanceLog({
        title: args.title,
        unit: [unit.id],
        type: args.type,
        priority: args.priority,
        status: "Open",
        reported_by: args.reported_by,
        description: args.description,
        date_reported: new Date().toISOString().split("T")[0],
      });
      return { content: [{ type: "text", text: `Maintenance log created:\n  ID: ${record.id}\n  Title: ${record.fields.title}` }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Failed: ${e}` }], isError: true };
    }
  });

  server.registerTool("get_tool_details", {
    description: "Get full tool details INCLUDING the text content of linked SOPs, safety documents, and manuals. Use this when you need the actual document content, not just URLs.",
    inputSchema: {
      name_or_id: z.string().describe("Tool name or AirTable record ID"),
    },
  }, async ({ name_or_id }) => {
    let tool: ToolWithMeta | undefined;

    if (name_or_id.startsWith("rec")) {
      try {
        const record = await fetchTool(name_or_id);
        const resolved = await getResolved();
        tool = resolved.find((t) => t.id === record.id);
      } catch { /* fall through */ }
    }

    if (!tool) {
      const resolved = await getResolved();
      tool = resolved.find((t) => t.name.toLowerCase() === name_or_id.toLowerCase())
        || resolved.find((t) => t.name.toLowerCase().includes(name_or_id.toLowerCase()));
    }

    if (!tool) return { content: [{ type: "text", text: `Tool not found: ${name_or_id}` }], isError: true };

    // Fetch actual document content from linked URLs
    const docSources = [
      { label: "Safety Document", url: tool.safety_doc_url },
      { label: "Operating Manual / SOP", url: tool.sop_url },
      { label: "Video Tutorial", url: tool.video_url },
    ].filter((d) => d.url) as { label: string; url: string }[];

    const docs = (await Promise.all(
      docSources.map(async (d) => {
        const text = await fetchDocContent(d.url);
        return text ? { label: d.label, url: d.url, excerpt: text.slice(0, 5000) } : null;
      })
    )).filter(Boolean);

    const result = {
      ...tool,
      sources: docs,
      detail_page: `/tools/${tool.id}`,
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  server.registerTool("evaluate_image", {
    description: "Evaluate a single tool's image using Claude vision. Checks if image matches the tool.",
    inputSchema: { tool_name: z.string().describe("Name of the tool to evaluate") },
  }, async ({ tool_name }) => {
    const tool = await findToolByName(tool_name);
    if (!tool) return { content: [{ type: "text", text: `Tool not found: ${tool_name}` }], isError: true };
    const result = await evaluateImage(toolToImageInfo(tool));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  });

  // ── Chat agent ──────────────────────────────────────────────────

  server.registerTool("chat", {
    description: "Ask the MakerLab chat assistant a question. The assistant has full access to the tool inventory, documentation, unit details, maintenance reporting, image generation, and follow-up suggestions. Supports multi-turn conversations via the history parameter.",
    inputSchema: {
      message: z.string().describe("The user's message or question"),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).optional().describe("Previous conversation messages for multi-turn context"),
      tool_id: z.string().optional().describe("AirTable record ID or tool name to scope to a specific tool"),
    },
  }, async ({ message, history, tool_id }) => {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

      const client = new Anthropic({ apiKey });

      // Build system prompt
      let systemPrompt: string;
      let allResolved: ToolWithMeta[] = [];

      if (tool_id) {
        let toolMeta: ToolWithMeta | undefined;
        if (tool_id.startsWith("rec")) {
          try {
            const record = await fetchTool(tool_id);
            const resolved = await getResolved();
            toolMeta = resolved.find((t) => t.id === record.id);
          } catch { /* fall through */ }
        }
        if (!toolMeta) {
          const resolved = await getResolved();
          toolMeta = resolved.find((t) => t.name.toLowerCase() === tool_id.toLowerCase())
            || resolved.find((t) => t.name.toLowerCase().includes(tool_id.toLowerCase()));
        }
        if (!toolMeta) throw new Error(`Tool not found: ${tool_id}`);

        const docSources = [
          { label: "Safety Document", url: toolMeta.safety_doc_url },
          { label: "Operating Manual / SOP", url: toolMeta.sop_url },
          { label: "Video Tutorial", url: toolMeta.video_url },
        ].filter((d) => d.url) as { label: string; url: string }[];

        const docs = (await Promise.all(
          docSources.map(async (d) => {
            const text = await fetchDocContent(d.url);
            return text ? `### ${d.label}\nURL: ${d.url}\n\n${text.slice(0, 5000)}` : null;
          })
        )).filter(Boolean);

        systemPrompt = `You are a helpful assistant for the Cornell MakerLab answering questions about ${toolMeta.name}.

## Tool Information
- Name: ${toolMeta.name}
- Category: ${toolMeta.category_group} — ${toolMeta.category_sub}
- Location: ${toolMeta.location_room} — ${toolMeta.location_zone}
- Description: ${toolMeta.description}
${toolMeta.materials.length > 0 ? `- Materials: ${toolMeta.materials.join(", ")}` : ""}
${toolMeta.ppe_required.length > 0 ? `- PPE Required: ${toolMeta.ppe_required.join(", ")}` : ""}
${toolMeta.training_required ? "- Training Required: Yes" : ""}
${toolMeta.authorized_only ? "- Authorization Required: Yes" : ""}

${docs.length > 0 ? `## Source Documents\n${docs.join("\n\n---\n\n")}` : ""}

## Guidelines
- Answer questions about this tool's capabilities, safety, setup, and materials.
- Cite sources when using document content.
- Be concise but thorough. If a student reports an issue, use the report_issue tool.
- At the end of every response, call suggest_followups with 2-4 follow-up questions.`;
        allResolved = [toolMeta];
      } else {
        allResolved = await getResolved();
        const inventory = allResolved.map((t) =>
          `- ${t.name} [id: ${t.id}] (${t.category_group} — ${t.category_sub}, ${t.location_room}): ${t.description?.slice(0, 120) || "No description"}`
        ).join("\n");

        systemPrompt = `You are a helpful assistant for the Cornell MakerLab.

## Available Equipment (${allResolved.length} tools)
${inventory}

## Guidelines
- Help students find the right tool for their project.
- When recommending tools, mention location and safety requirements.
- Use get_tool_details for detailed questions about a specific tool.
- Use report_issue when a student describes equipment problems.
- Use visualize_project after gathering enough detail about a project.
- Use generate_infographic after explaining steps, to create a visual guide.
- At the end of every response, call suggest_followups with 2-4 follow-up questions.`;
      }

      // Claude tool definitions
      const chatTools: Anthropic.Tool[] = [
        {
          name: "get_tool_details",
          description: "Fetch detailed tool information and documentation.",
          input_schema: {
            type: "object" as const,
            properties: { tool_name: { type: "string", description: "Tool name" } },
            required: ["tool_name"],
          },
        },
        {
          name: "get_unit_details",
          description: "Fetch unit details including maintenance history.",
          input_schema: {
            type: "object" as const,
            properties: { unit_label: { type: "string", description: "Unit label" } },
            required: ["unit_label"],
          },
        },
        {
          name: "report_issue",
          description: "Report an equipment issue.",
          input_schema: {
            type: "object" as const,
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              unit_label: { type: "string" },
              priority: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
              reported_by: { type: "string" },
            },
            required: ["title", "description"],
          },
        },
        ...(!tool_id ? [
          {
            name: "visualize_project",
            description: "Generate a concept image of a project.",
            input_schema: {
              type: "object" as const,
              properties: { prompt: { type: "string", description: "Detailed visual prompt" } },
              required: ["prompt"],
            },
          },
          {
            name: "generate_infographic",
            description: "Generate a visual step-by-step infographic.",
            input_schema: {
              type: "object" as const,
              properties: {
                title: { type: "string" },
                steps: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      number: { type: "number" },
                      label: { type: "string" },
                      detail: { type: "string" },
                    },
                    required: ["number", "label", "detail"],
                  },
                },
              },
              required: ["title", "steps"],
            },
          },
        ] as Anthropic.Tool[] : []),
        {
          name: "suggest_followups",
          description: "Suggest follow-up questions. Call at end of every response.",
          input_schema: {
            type: "object" as const,
            properties: {
              suggestions: {
                type: "array",
                items: { type: "string" },
                description: "2-4 follow-up questions",
              },
            },
            required: ["suggestions"],
          },
        },
      ];

      // Build messages
      const messages: Anthropic.MessageParam[] = [];
      if (history) {
        for (const msg of history) {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
      messages.push({ role: "user", content: message });

      const collectedImages: Array<{ base64: string; mimeType: string; caption?: string }> = [];
      const collectedSuggestions: string[] = [];

      // Tool execution helper
      async function execTool(name: string, input: Record<string, unknown>): Promise<string> {
        switch (name) {
          case "get_tool_details": {
            const toolName = input.tool_name as string;
            const match = allResolved.find((t) => t.name.toLowerCase() === toolName.toLowerCase())
              || allResolved.find((t) => t.name.toLowerCase().includes(toolName.toLowerCase()));
            if (!match) return JSON.stringify({ found: false });

            const docSrcs = [
              { label: "Safety Document", url: match.safety_doc_url },
              { label: "SOP", url: match.sop_url },
              { label: "Video", url: match.video_url },
            ].filter((d) => d.url) as { label: string; url: string }[];

            const docs = (await Promise.all(
              docSrcs.map(async (d) => {
                const text = await fetchDocContent(d.url);
                return text ? { label: d.label, url: d.url, excerpt: text.slice(0, 5000) } : null;
              })
            )).filter(Boolean);

            return JSON.stringify({ found: true, name: match.name, description: match.description, category: `${match.category_group} — ${match.category_sub}`, location: `${match.location_room} — ${match.location_zone}`, materials: match.materials, ppe_required: match.ppe_required, training_required: match.training_required, authorized_only: match.authorized_only, sources: docs });
          }
          case "get_unit_details": {
            const label = input.unit_label as string;
            const all = await fetchAllUnits();
            const unit = all.find((u) => u.fields.unit_label.toLowerCase() === label.toLowerCase())
              || all.find((u) => u.fields.unit_label.toLowerCase().includes(label.toLowerCase()));
            if (!unit) return JSON.stringify({ found: false });
            const logs = await fetchMaintenanceLogsByUnit(unit.id);
            return JSON.stringify({ found: true, unit_label: unit.fields.unit_label, id: unit.id, status: unit.fields.status || "Unknown", condition: unit.fields.condition || "Unknown", maintenance_logs: logs.slice(0, 10).map((l) => ({ title: l.fields.title, status: l.fields.status || "", date_reported: l.fields.date_reported || "" })) });
          }
          case "report_issue": {
            const { title: t, description: d, unit_label: ul, priority: p, reported_by: rb } = input as { title: string; description: string; unit_label?: string; priority?: string; reported_by?: string };
            if (!ul) return JSON.stringify({ success: false, message: "Unit label required" });
            const all = await fetchAllUnits();
            const unit = all.find((u) => u.fields.unit_label.toLowerCase() === ul.toLowerCase());
            if (!unit) return JSON.stringify({ success: false, message: `Unit not found: ${ul}` });
            const record = await createMaintenanceLog({ title: t, unit: [unit.id], type: "Issue Report", priority: (p || "Medium") as MaintenancePriority, status: "Open", reported_by: rb, description: d, date_reported: new Date().toISOString().split("T")[0] });
            return JSON.stringify({ success: true, ticket_id: record.id });
          }
          case "visualize_project": {
            try {
              const { imageBase64, mimeType, text } = await generateImage(input.prompt as string);
              collectedImages.push({ base64: imageBase64, mimeType, caption: text || "Project concept image" });
              return JSON.stringify({ success: true, message: text || "Image generated." });
            } catch (err) {
              return JSON.stringify({ success: false, message: err instanceof Error ? err.message : "Failed" });
            }
          }
          case "generate_infographic": {
            const { title: iTitle, steps: iSteps } = input as { title: string; steps: Array<{ number: number; label: string; detail: string }> };
            try {
              const stepDesc = iSteps.map((s) => `Step ${s.number}: "${s.label}" — ${s.detail}`).join("\n");
              const prompt = `Create a clean, professional vertical infographic titled "${iTitle}". Layout: numbered steps top to bottom. Steps:\n${stepDesc}\nStyle: flat design, Cornell red (#B31B1B) accents, white background. No watermarks.`;
              const { imageBase64, mimeType, text } = await generateImage(prompt);
              collectedImages.push({ base64: imageBase64, mimeType, caption: text || `Infographic: ${iTitle}` });
              return JSON.stringify({ success: true, message: text || "Infographic generated." });
            } catch (err) {
              return JSON.stringify({ success: false, message: err instanceof Error ? err.message : "Failed" });
            }
          }
          case "suggest_followups": {
            const s = input.suggestions as string[];
            collectedSuggestions.push(...s);
            return JSON.stringify({ suggestions: s, done: true });
          }
          default:
            return JSON.stringify({ error: `Unknown tool: ${name}` });
        }
      }

      // Agentic loop
      for (let step = 0; step < 5; step++) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: chatTools,
        });

        const textParts: string[] = [];
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

        for (const block of response.content) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") toolUses.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> });
        }

        if (toolUses.length === 0) {
          // Done — build MCP response
          const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
          content.push({ type: "text", text: textParts.join("\n\n") });
          for (const img of collectedImages) {
            content.push({ type: "image", data: img.base64, mimeType: img.mimeType });
            if (img.caption) content.push({ type: "text", text: `*${img.caption}*` });
          }
          if (collectedSuggestions.length > 0) {
            content.push({ type: "text", text: `\n---\n**Suggested follow-ups:**\n${collectedSuggestions.map((s) => `- ${s}`).join("\n")}` });
          }
          return { content };
        }

        // Execute tools and continue
        messages.push({ role: "assistant", content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
          const result = await execTool(tu.name, tu.input);
          toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: result });
        }
        messages.push({ role: "user", content: toolResults });

        if (response.stop_reason === "end_turn") {
          const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
          content.push({ type: "text", text: textParts.join("\n\n") });
          for (const img of collectedImages) {
            content.push({ type: "image", data: img.base64, mimeType: img.mimeType });
          }
          if (collectedSuggestions.length > 0) {
            content.push({ type: "text", text: `\n---\n**Suggested follow-ups:**\n${collectedSuggestions.map((s) => `- ${s}`).join("\n")}` });
          }
          return { content };
        }
      }

      return { content: [{ type: "text", text: "Chat completed (max steps reached)." }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Chat error: ${e instanceof Error ? e.message : "Unknown error"}` }],
        isError: true,
      };
    }
  });

  // ── Image generation ────────────────────────────────────────────

  server.registerTool("visualize_project", {
    description: "Generate a concept image of a project or finished object using AI image generation (Gemini).",
    inputSchema: {
      prompt: z.string().describe("Detailed scene description: finished object, materials, colors, textures, setting, lighting, camera angle."),
    },
  }, async ({ prompt }) => {
    try {
      const { imageBase64, mimeType, text } = await generateImage(prompt);
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
      content.push({ type: "image", data: imageBase64, mimeType });
      if (text) content.push({ type: "text", text });
      return { content };
    } catch (e) {
      return { content: [{ type: "text", text: `Image generation failed: ${e instanceof Error ? e.message : "Unknown error"}` }], isError: true };
    }
  });

  server.registerTool("generate_infographic", {
    description: "Generate a visual step-by-step infographic showing how to make or build something.",
    inputSchema: {
      title: z.string().describe("Short title for the infographic"),
      steps: z.array(z.object({
        number: z.number().describe("Step number"),
        label: z.string().describe("Short action label"),
        detail: z.string().describe("Brief detail"),
      })).min(3).max(8).describe("Ordered steps to illustrate"),
    },
  }, async ({ title, steps }) => {
    try {
      const stepDesc = steps.map((s: { number: number; label: string; detail: string }) =>
        `Step ${s.number}: "${s.label}" — ${s.detail}`
      ).join("\n");
      const prompt = `Create a clean, professional vertical infographic titled "${title}".
Layout: numbered steps flowing top to bottom, each with a small icon/illustration and text label.
Steps:
${stepDesc}
Style: flat design, warm color palette with Cornell red (#B31B1B) accents, white background, clear numbered circles, simple tool/object illustrations beside each step. Phone-screen readable. No watermarks or logos.`;

      const { imageBase64, mimeType, text } = await generateImage(prompt);
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];
      content.push({ type: "image", data: imageBase64, mimeType });
      if (text) content.push({ type: "text", text });
      return { content };
    } catch (e) {
      return { content: [{ type: "text", text: `Infographic generation failed: ${e instanceof Error ? e.message : "Unknown error"}` }], isError: true };
    }
  });

  // ── Follow-up suggestions ───────────────────────────────────────

  server.registerTool("suggest_followups", {
    description: "Get suggested follow-up questions for a topic or conversation context.",
    inputSchema: {
      topic: z.string().describe("Topic or context for generating follow-up questions"),
      count: z.number().optional().describe("Number of suggestions (2-4, default 3)"),
    },
  }, async ({ topic, count }) => {
    const n = Math.min(4, Math.max(2, count || 3));
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        system: "You generate short, natural follow-up questions a Cornell student might ask about makerspace equipment and projects. Return ONLY a JSON array of strings.",
        messages: [{ role: "user", content: `Generate ${n} follow-up questions about: ${topic}` }],
      });
      const text = response.content[0].type === "text" ? response.content[0].text : "[]";
      let suggestions: string[];
      try { suggestions = JSON.parse(text); } catch { suggestions = [text]; }
      return { content: [{ type: "text", text: JSON.stringify({ suggestions }, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Failed: ${e instanceof Error ? e.message : "Unknown error"}` }], isError: true };
    }
  });

  return server;
}

// ── Route handler ──────────────────────────────────────────────────

async function handler(req: Request): Promise<Response> {
  const expectedApiKey = process.env.MCP_API_KEY;
  if (!expectedApiKey) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "MCP_API_KEY is not configured" }, id: null },
      { status: 503 }
    );
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerKey = req.headers.get("x-api-key") || "";
  const suppliedKey = bearer || headerKey;
  if (suppliedKey !== expectedApiKey) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
      { status: 401 }
    );
  }

  const ip = getClientIp(req);
  const { allowed } = await rateLimitAsync(`mcp:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!allowed) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Too many requests. Please wait a moment." }, id: null },
      { status: 429 }
    );
  }

  // GET is used for SSE streams — not supported in stateless serverless mode
  if (req.method === "GET") {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "SSE not supported in serverless mode" }, id: null },
      { status: 405 }
    );
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true, // Return JSON instead of SSE — required for serverless
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(req);
  } catch {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null },
      { status: 500 }
    );
  }
}

export const POST = handler;
export const GET = handler;
export const DELETE = handler;
