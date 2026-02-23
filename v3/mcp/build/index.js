#!/usr/bin/env node
/**
 * MakerLab MCP Server
 *
 * Exposes AirTable inventory and image evaluation tools
 * via the Model Context Protocol.
 *
 * Transports:
 *   stdio (default):  node build/index.js
 *   HTTP:             node build/index.js --http [--port 3000]
 *                     PORT=3000 node build/index.js --http
 */
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { listTools, getTool, searchTools, listUnits, getUnit, createMaintenanceLog, getToolsWithImages, } from "./airtable.js";
import { evaluateImage, evaluateAllImages } from "./eval-images.js";
// ── Load environment ───────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../app/.env.local") });
// ── Tool registration ──────────────────────────────────────────────
function registerAllTools(server) {
    server.registerTool("list_tools", {
        description: "List all tools in the MakerLab inventory. Returns name, category, location, and whether the tool has an image. Optionally filter by category or location.",
        inputSchema: {
            category: z
                .string()
                .optional()
                .describe("Filter by category group or subcategory (case-insensitive partial match)"),
            location: z
                .string()
                .optional()
                .describe("Filter by room or zone name (case-insensitive partial match)"),
        },
    }, async ({ category, location }) => {
        const tools = await listTools({ category, location });
        const lines = tools.map((t) => `${t.name} | ${t.category_group} > ${t.category_sub} | ${t.location_room} / ${t.location_zone} | image: ${t.has_image ? "yes" : "no"}`);
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${tools.length} tools:\n\n${lines.join("\n")}`,
                },
            ],
        };
    });
    server.registerTool("get_tool", {
        description: "Get full details for a tool by name or AirTable record ID. Returns description, category, location, materials, safety info, and more.",
        inputSchema: {
            name_or_id: z
                .string()
                .describe("Tool name (e.g. 'Form 2') or AirTable record ID (e.g. 'recXXX')"),
        },
    }, async ({ name_or_id }) => {
        const tool = await getTool(name_or_id);
        if (!tool) {
            return {
                content: [{ type: "text", text: `Tool not found: ${name_or_id}` }],
                isError: true,
            };
        }
        return {
            content: [{ type: "text", text: JSON.stringify(tool, null, 2) }],
        };
    });
    server.registerTool("search_tools", {
        description: "Keyword search across tool names, descriptions, materials, and tags. Returns matching tools with details.",
        inputSchema: {
            query: z.string().describe("Search keyword or phrase"),
        },
    }, async ({ query }) => {
        const results = await searchTools(query);
        if (results.length === 0) {
            return {
                content: [
                    { type: "text", text: `No tools found matching "${query}"` },
                ],
            };
        }
        const summary = results
            .map((t) => `- ${t.name}: ${t.description.slice(0, 100)}${t.description.length > 100 ? "..." : ""}`)
            .join("\n");
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${results.length} tools matching "${query}":\n\n${summary}`,
                },
            ],
        };
    });
    server.registerTool("list_units", {
        description: "List all units (individual instances of tools) with their status and condition. Optionally filter by tool name.",
        inputSchema: {
            tool_name: z
                .string()
                .optional()
                .describe("Filter units to a specific tool by name"),
        },
    }, async ({ tool_name }) => {
        const units = await listUnits(tool_name);
        if (units.length === 0) {
            return {
                content: [
                    {
                        type: "text",
                        text: tool_name
                            ? `No units found for tool "${tool_name}"`
                            : "No units found",
                    },
                ],
            };
        }
        const lines = units.map((u) => `${u.unit_label} | ${u.tool_name} | status: ${u.status} | condition: ${u.condition}`);
        return {
            content: [
                {
                    type: "text",
                    text: `Found ${units.length} units:\n\n${lines.join("\n")}`,
                },
            ],
        };
    });
    server.registerTool("get_unit", {
        description: "Get full details for a unit by label or AirTable record ID. Includes maintenance history.",
        inputSchema: {
            label_or_id: z
                .string()
                .describe("Unit label (e.g. 'Form 2 #1') or AirTable record ID"),
        },
    }, async ({ label_or_id }) => {
        const unit = await getUnit(label_or_id);
        if (!unit) {
            return {
                content: [{ type: "text", text: `Unit not found: ${label_or_id}` }],
                isError: true,
            };
        }
        return {
            content: [{ type: "text", text: JSON.stringify(unit, null, 2) }],
        };
    });
    server.registerTool("create_maintenance_log", {
        description: "Create a maintenance log entry for a unit. Requires a title and unit label. The log is created with status 'Open' and today's date.",
        inputSchema: {
            title: z.string().describe("Short title for the maintenance issue"),
            unit_label: z.string().describe("Unit label (e.g. 'Form 2 #1')"),
            type: z
                .enum([
                "Issue Report",
                "Preventive Maintenance",
                "Repair",
                "Inspection",
                "Calibration",
            ])
                .optional()
                .describe("Type of maintenance entry"),
            priority: z
                .enum(["Critical", "High", "Medium", "Low"])
                .optional()
                .describe("Priority level"),
            reported_by: z.string().optional().describe("Name of the reporter"),
            description: z
                .string()
                .optional()
                .describe("Detailed description of the issue"),
        },
    }, async (args) => {
        try {
            const result = await createMaintenanceLog(args);
            return {
                content: [
                    {
                        type: "text",
                        text: `Maintenance log created:\n  ID: ${result.id}\n  Title: ${result.title}`,
                    },
                ],
            };
        }
        catch (e) {
            return {
                content: [
                    { type: "text", text: `Failed to create maintenance log: ${e}` },
                ],
                isError: true,
            };
        }
    });
    server.registerTool("evaluate_image", {
        description: "Evaluate a single tool's image using Claude vision. Checks whether the image matches the tool's name and description. Returns match status, confidence, and reasoning.",
        inputSchema: {
            tool_name: z.string().describe("Name of the tool to evaluate"),
        },
    }, async ({ tool_name }) => {
        const allTools = await getToolsWithImages();
        const tool = allTools.find((t) => t.name.toLowerCase() === tool_name.toLowerCase());
        if (!tool) {
            return {
                content: [{ type: "text", text: `Tool not found: ${tool_name}` }],
                isError: true,
            };
        }
        const result = await evaluateImage(tool);
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
    });
    server.registerTool("evaluate_all_images", {
        description: "Batch evaluate images for all tools (or a filtered subset) using Claude vision. Returns a summary with pass/fail/warn/skip/error counts and details for failures.",
        inputSchema: {
            category: z
                .string()
                .optional()
                .describe("Only evaluate tools in this category"),
            limit: z
                .number()
                .optional()
                .describe("Max number of tools to evaluate (0 or omit for all)"),
        },
    }, async ({ category, limit }) => {
        let tools = await getToolsWithImages();
        if (category) {
            const resolved = await listTools({ category });
            const names = new Set(resolved.map((t) => t.name));
            tools = tools.filter((t) => names.has(t.name));
        }
        if (limit && limit > 0) {
            tools = tools.slice(0, limit);
        }
        const { results, summary } = await evaluateAllImages(tools);
        const failures = results
            .filter((r) => r.status === "FAIL")
            .map((r) => `  ${r.name}: ${r.eval?.image_shows || "?"} — ${r.eval?.reasoning || "?"}`);
        const warnings = results
            .filter((r) => r.status === "WARN")
            .map((r) => `  ${r.name}: ${r.filename_issue || "?"}`);
        let text = `Image Evaluation Complete\n`;
        text += `========================\n`;
        text += `PASS: ${summary.pass} | FAIL: ${summary.fail} | WARN: ${summary.warn} | SKIP: ${summary.skip} | ERROR: ${summary.error}\n`;
        if (failures.length > 0) {
            text += `\nFailed (image does not match tool):\n${failures.join("\n")}`;
        }
        if (warnings.length > 0) {
            text += `\nWarnings (filename mismatch):\n${warnings.join("\n")}`;
        }
        return { content: [{ type: "text", text }] };
    });
}
// ── Server factory ─────────────────────────────────────────────────
function createServer() {
    const s = new McpServer({ name: "makerlab", version: "1.0.0" });
    registerAllTools(s);
    return s;
}
// ── Start server ───────────────────────────────────────────────────
const useHttp = process.argv.includes("--http");
if (useHttp) {
    const portFlag = process.argv.indexOf("--port");
    const port = portFlag !== -1
        ? parseInt(process.argv[portFlag + 1], 10)
        : parseInt(process.env.PORT || "3000", 10);
    const app = createMcpExpressApp({ host: "0.0.0.0" });
    const transports = {};
    app.post("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        try {
            let transport;
            if (sessionId && transports[sessionId]) {
                transport = transports[sessionId];
            }
            else if (!sessionId && isInitializeRequest(req.body)) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports[sid] = transport;
                    },
                });
                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && transports[sid])
                        delete transports[sid];
                };
                const sessionServer = createServer();
                await sessionServer.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            }
            else {
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32000,
                        message: "Bad Request: No valid session ID",
                    },
                    id: null,
                });
                return;
            }
            await transport.handleRequest(req, res, req.body);
        }
        catch (error) {
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    });
    app.get("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send("Invalid or missing session ID");
            return;
        }
        await transports[sessionId].handleRequest(req, res);
    });
    app.delete("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId || !transports[sessionId]) {
            res.status(400).send("Invalid or missing session ID");
            return;
        }
        await transports[sessionId].handleRequest(req, res);
    });
    app.get("/health", (_req, res) => {
        res.json({ status: "ok", server: "makerlab", version: "1.0.0" });
    });
    app.listen(port, () => {
        console.error(`MakerLab MCP server (HTTP) listening on port ${port}`);
        console.error(`  POST/GET/DELETE http://localhost:${port}/mcp`);
    });
    process.on("SIGINT", async () => {
        console.error("Shutting down...");
        for (const sid of Object.keys(transports)) {
            await transports[sid].close();
            delete transports[sid];
        }
        process.exit(0);
    });
}
else {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
