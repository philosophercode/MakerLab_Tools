import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { IncomingMessage, ServerResponse } from "http";

import {
  listTools,
  getTool,
  searchTools,
  listUnits,
  getUnit,
  createMaintenanceLog,
  getToolsWithImages,
} from "../src/airtable.js";
import { evaluateImage, evaluateAllImages } from "../src/eval-images.js";

// ── Tool registration (same as index.ts) ───────────────────────────

function createServer(): McpServer {
  const server = new McpServer({ name: "makerlab", version: "1.0.0" });

  server.registerTool(
    "list_tools",
    {
      description:
        "List all tools in the MakerLab inventory. Returns name, category, location, and whether the tool has an image. Optionally filter by category or location.",
      inputSchema: {
        category: z.string().optional().describe("Filter by category group or subcategory"),
        location: z.string().optional().describe("Filter by room or zone name"),
      },
    },
    async ({ category, location }) => {
      const tools = await listTools({ category, location });
      const lines = tools.map(
        (t) =>
          `${t.name} | ${t.category_group} > ${t.category_sub} | ${t.location_room} / ${t.location_zone} | image: ${t.has_image ? "yes" : "no"}`
      );
      return { content: [{ type: "text", text: `Found ${tools.length} tools:\n\n${lines.join("\n")}` }] };
    }
  );

  server.registerTool(
    "get_tool",
    {
      description: "Get full details for a tool by name or AirTable record ID.",
      inputSchema: {
        name_or_id: z.string().describe("Tool name or AirTable record ID"),
      },
    },
    async ({ name_or_id }) => {
      const tool = await getTool(name_or_id);
      if (!tool) return { content: [{ type: "text", text: `Tool not found: ${name_or_id}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }] };
    }
  );

  server.registerTool(
    "search_tools",
    {
      description: "Keyword search across tool names, descriptions, materials, and tags.",
      inputSchema: { query: z.string().describe("Search keyword or phrase") },
    },
    async ({ query }) => {
      const results = await searchTools(query);
      if (results.length === 0) return { content: [{ type: "text", text: `No tools found matching "${query}"` }] };
      const summary = results
        .map((t) => `- ${t.name}: ${t.description.slice(0, 100)}${t.description.length > 100 ? "..." : ""}`)
        .join("\n");
      return { content: [{ type: "text", text: `Found ${results.length} tools matching "${query}":\n\n${summary}` }] };
    }
  );

  server.registerTool(
    "list_units",
    {
      description: "List all units with their status and condition. Optionally filter by tool name.",
      inputSchema: { tool_name: z.string().optional().describe("Filter units to a specific tool") },
    },
    async ({ tool_name }) => {
      const units = await listUnits(tool_name);
      if (units.length === 0) {
        return { content: [{ type: "text", text: tool_name ? `No units found for "${tool_name}"` : "No units found" }] };
      }
      const lines = units.map((u) => `${u.unit_label} | ${u.tool_name} | status: ${u.status} | condition: ${u.condition}`);
      return { content: [{ type: "text", text: `Found ${units.length} units:\n\n${lines.join("\n")}` }] };
    }
  );

  server.registerTool(
    "get_unit",
    {
      description: "Get full details for a unit by label or record ID. Includes maintenance history.",
      inputSchema: { label_or_id: z.string().describe("Unit label or AirTable record ID") },
    },
    async ({ label_or_id }) => {
      const unit = await getUnit(label_or_id);
      if (!unit) return { content: [{ type: "text", text: `Unit not found: ${label_or_id}` }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify(unit, null, 2) }] };
    }
  );

  server.registerTool(
    "create_maintenance_log",
    {
      description: "Create a maintenance log entry for a unit.",
      inputSchema: {
        title: z.string().describe("Short title for the issue"),
        unit_label: z.string().describe("Unit label (e.g. 'Form 2 #1')"),
        type: z.enum(["Issue Report", "Preventive Maintenance", "Repair", "Inspection", "Calibration"]).optional(),
        priority: z.enum(["Critical", "High", "Medium", "Low"]).optional(),
        reported_by: z.string().optional(),
        description: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const result = await createMaintenanceLog(args);
        return { content: [{ type: "text", text: `Maintenance log created:\n  ID: ${result.id}\n  Title: ${result.title}` }] };
      } catch (e) {
        return { content: [{ type: "text", text: `Failed: ${e}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "evaluate_image",
    {
      description: "Evaluate a single tool's image using Claude vision.",
      inputSchema: { tool_name: z.string().describe("Name of the tool to evaluate") },
    },
    async ({ tool_name }) => {
      const allTools = await getToolsWithImages();
      const tool = allTools.find((t) => t.name.toLowerCase() === tool_name.toLowerCase());
      if (!tool) return { content: [{ type: "text", text: `Tool not found: ${tool_name}` }], isError: true };
      const result = await evaluateImage(tool);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.registerTool(
    "evaluate_all_images",
    {
      description: "Batch evaluate images for all tools. May timeout on serverless — use evaluate_image for individual tools instead.",
      inputSchema: {
        category: z.string().optional().describe("Only evaluate tools in this category"),
        limit: z.number().optional().describe("Max tools to evaluate"),
      },
    },
    async ({ category, limit }) => {
      let tools = await getToolsWithImages();
      if (category) {
        const resolved = await listTools({ category });
        const names = new Set(resolved.map((t) => t.name));
        tools = tools.filter((t) => names.has(t.name));
      }
      if (limit && limit > 0) tools = tools.slice(0, limit);
      const { results, summary } = await evaluateAllImages(tools);
      const failures = results.filter((r) => r.status === "FAIL").map((r) => `  ${r.name}: ${r.eval?.image_shows || "?"}`);
      let text = `PASS: ${summary.pass} | FAIL: ${summary.fail} | WARN: ${summary.warn} | SKIP: ${summary.skip} | ERROR: ${summary.error}`;
      if (failures.length > 0) text += `\n\nFailed:\n${failures.join("\n")}`;
      return { content: [{ type: "text", text }] };
    }
  );

  return server;
}

// ── Vercel serverless handler ──────────────────────────────────────

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless — no sessions
  });

  await server.connect(transport);

  try {
    await transport.handleRequest(
      req as Parameters<typeof transport.handleRequest>[0],
      res as Parameters<typeof transport.handleRequest>[1],
      req.body
    );
  } catch (error) {
    if (!res.writableEnded) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      }));
    }
  } finally {
    await transport.close();
    await server.close();
  }
}
