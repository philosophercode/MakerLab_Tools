/**
 * Chat agent for MCP server.
 *
 * Wraps the Anthropic Claude API with tool-calling to provide the same
 * conversational experience as the /api/chat route — tool lookup, doc
 * fetching, unit details, maintenance reporting, image generation, and
 * follow-up suggestions — all accessible via a single MCP tool call.
 */
import Anthropic from "@anthropic-ai/sdk";
import { listTools, getTool, getUnit, createMaintenanceLog, } from "./airtable.js";
import { fetchDocContent } from "./doc-fetcher.js";
import { generateImage } from "./gemini-image.js";
// ── System prompts ──────────────────────────────────────────────────
function buildGeneralSystemPrompt(tools) {
    const inventory = tools
        .map((t) => `- **${t.name}** [id: ${t.id}] (${t.category_group} — ${t.category_sub}, ${t.location_room}): ${t.description?.slice(0, 120) || "No description"}${t.materials.length > 0 ? `. Materials: ${t.materials.join(", ")}` : ""}`)
        .join("\n");
    return `You are a helpful assistant for the Cornell MakerLab. You help students find and learn about makerspace equipment, and help them plan builds using available tools.

## Available Equipment (${tools.length} tools)
${inventory}

## Guidelines
- Help students find the right tool for their project.
- When recommending tools, mention their location and any safety requirements.
- Be concise but thorough. Use bullet points for lists.
- When a student asks detailed questions about a specific tool, use the get_tool_details tool to fetch full information and documentation before answering.
- When your answer uses information from fetched documentation, cite the source.
- You are speaking to Cornell students who may be beginners. Be encouraging and supportive.
- If a student reports an issue or problem with equipment, use the report_issue tool to log it. Gather a brief title and description. Ask for their name if they haven't provided it.
- Students may share photos of equipment. Help identify tools from images, diagnose problems, or suggest next steps.

## Project Planning
When a student describes something they want to build:
1. **Understand the project:** Ask what they want to make.
2. **Clarify constraints:** Material preferences, precision, skill level, size, timeline.
3. **Generate a plan:** Materials needed, tools & steps, safety requirements, estimated time, tips.
- Only recommend tools in the MakerLab inventory.

## Project Visualization
You have a visualize_project tool that generates a concept image.
- Use it after gathering enough detail about what the student wants to build.
- Write a detailed visual prompt describing the finished object.
- Always describe the COMPLETE finished object fully visible in the frame.

## Step-by-Step Infographics
You have a generate_infographic tool that creates visual how-to guides.
- Use after explaining steps in text, to create a visual companion.
- Keep to 3-8 steps, each a clear action.

## Follow-ups
- At the end of every response, call the suggest_followups tool with 2-4 short, natural follow-up questions.`;
}
function buildToolSystemPrompt(tool, docs) {
    let prompt = `You are a helpful assistant for the Cornell MakerLab. You are answering questions about a specific tool.

## Tool Information
- **Name:** ${tool.name}
- **Category:** ${tool.category_group} — ${tool.category_sub}
- **Location:** ${tool.location_room} — ${tool.location_zone}
- **Description:** ${tool.description}`;
    if (tool.materials.length > 0) {
        prompt += `\n- **Compatible Materials:** ${tool.materials.join(", ")}`;
    }
    if (tool.ppe_required.length > 0) {
        prompt += `\n- **PPE Required:** ${tool.ppe_required.join(", ")}`;
    }
    if (tool.training_required) {
        prompt += `\n- **Training Required:** Yes`;
    }
    if (tool.authorized_only) {
        prompt += `\n- **Authorization Required:** Yes`;
    }
    if (tool.sop_url) {
        prompt += `\n- **SOP:** ${tool.sop_url}`;
    }
    if (tool.safety_doc_url) {
        prompt += `\n- **Safety Doc:** ${tool.safety_doc_url}`;
    }
    if (tool.video_url) {
        prompt += `\n- **Video Tutorial:** ${tool.video_url}`;
    }
    if (docs.length > 0) {
        prompt += `\n\n## Source Documents\n`;
        for (const doc of docs) {
            prompt += `\n### ${doc.label}\nURL: ${doc.url}\n\n${doc.text}\n\n---\n`;
        }
    }
    prompt += `\n\n## Guidelines
- Answer questions about this tool's capabilities, safety, setup, and materials.
- Cite sources when using document content.
- Be concise but thorough.
- If a student reports an issue, use the report_issue tool.
- If you identify a specific unit, call get_unit_details.

## Follow-ups
- At the end of every response, call the suggest_followups tool with 2-4 short, natural follow-up questions.`;
    return prompt;
}
// ── Tool definitions for Claude ─────────────────────────────────────
const CHAT_TOOLS = [
    {
        name: "get_tool_details",
        description: "Fetch detailed information and documentation for a specific tool. Use when a student asks detailed questions about a tool.",
        input_schema: {
            type: "object",
            properties: {
                tool_name: {
                    type: "string",
                    description: "The name of the tool to look up",
                },
            },
            required: ["tool_name"],
        },
    },
    {
        name: "get_unit_details",
        description: "Fetch details for a specific unit (individual machine instance), including status, condition, and maintenance history.",
        input_schema: {
            type: "object",
            properties: {
                unit_label: {
                    type: "string",
                    description: "Unit label, e.g. 'Prusa #1'",
                },
            },
            required: ["unit_label"],
        },
    },
    {
        name: "report_issue",
        description: "Report an equipment issue or maintenance request.",
        input_schema: {
            type: "object",
            properties: {
                title: { type: "string", description: "Brief summary of the issue" },
                description: { type: "string", description: "Detailed description" },
                unit_label: {
                    type: "string",
                    description: "Unit label if known, e.g. 'Prusa #1'",
                },
                priority: {
                    type: "string",
                    enum: ["Critical", "High", "Medium", "Low"],
                    description: "Urgency level",
                },
                reported_by: {
                    type: "string",
                    description: "Student name or NetID if provided",
                },
            },
            required: ["title", "description"],
        },
    },
    {
        name: "visualize_project",
        description: "Generate a concept image of a student's project. Write a detailed visual prompt describing the finished object.",
        input_schema: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "Detailed scene description: finished object, materials, colors, textures, setting, lighting, camera angle.",
                },
            },
            required: ["prompt"],
        },
    },
    {
        name: "generate_infographic",
        description: "Generate a visual step-by-step infographic for a making/building process.",
        input_schema: {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "Short title, e.g. 'How to Laser Cut a Phone Stand'",
                },
                steps: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            number: { type: "number" },
                            label: { type: "string", description: "Short action label" },
                            detail: { type: "string", description: "Brief detail" },
                        },
                        required: ["number", "label", "detail"],
                    },
                    description: "Ordered steps (3-8)",
                },
            },
            required: ["title", "steps"],
        },
    },
    {
        name: "suggest_followups",
        description: "Suggest 2-4 follow-up questions the student might want to ask next. Call this at the end of every response.",
        input_schema: {
            type: "object",
            properties: {
                suggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "Short, natural follow-up questions",
                },
            },
            required: ["suggestions"],
        },
    },
];
// ── Tool execution ──────────────────────────────────────────────────
async function executeTool(name, input, resolvedTools, images, suggestions) {
    switch (name) {
        case "get_tool_details": {
            const toolName = input.tool_name;
            const match = resolvedTools.find((t) => t.name.toLowerCase() === toolName.toLowerCase()) ||
                resolvedTools.find((t) => t.name.toLowerCase().includes(toolName.toLowerCase()));
            if (!match)
                return JSON.stringify({ found: false, message: `No tool found matching "${toolName}".` });
            const docSources = [
                { label: "Safety Document", url: match.safety_doc_url },
                { label: "Operating Manual / SOP", url: match.sop_url },
                { label: "Video Tutorial", url: match.video_url },
            ].filter((d) => d.url);
            const fetchedDocs = (await Promise.all(docSources.map(async (d) => {
                const text = await fetchDocContent(d.url);
                return text ? { label: d.label, url: d.url, excerpt: text.slice(0, 5000) } : null;
            }))).filter(Boolean);
            return JSON.stringify({
                found: true,
                name: match.name,
                description: match.description,
                category: `${match.category_group} — ${match.category_sub}`,
                location: `${match.location_room} — ${match.location_zone}`,
                materials: match.materials,
                ppe_required: match.ppe_required,
                training_required: match.training_required,
                authorized_only: match.authorized_only,
                sop_url: match.sop_url,
                safety_doc_url: match.safety_doc_url,
                video_url: match.video_url,
                sources: fetchedDocs,
            });
        }
        case "get_unit_details": {
            const unitLabel = input.unit_label;
            const unit = await getUnit(unitLabel);
            if (!unit)
                return JSON.stringify({ found: false, message: `No unit found matching "${unitLabel}".` });
            return JSON.stringify({ found: true, ...unit });
        }
        case "report_issue": {
            const { title, description, unit_label, priority, reported_by } = input;
            if (unit_label) {
                try {
                    const result = await createMaintenanceLog({
                        title,
                        unit_label,
                        type: "Issue Report",
                        priority: priority || "Medium",
                        reported_by,
                        description,
                    });
                    return JSON.stringify({
                        success: true,
                        ticket_id: result.id,
                        message: `Issue reported successfully. Ticket ID: ${result.id}`,
                    });
                }
                catch (e) {
                    return JSON.stringify({
                        success: false,
                        message: e instanceof Error ? e.message : "Failed to create log",
                    });
                }
            }
            return JSON.stringify({
                success: false,
                message: "Unit label is required to file a maintenance report. Ask the student which unit is affected.",
            });
        }
        case "visualize_project": {
            const prompt = input.prompt;
            try {
                const { imageBase64, mimeType, text } = await generateImage(prompt);
                images.push({
                    base64: imageBase64,
                    mimeType,
                    caption: text || "Project concept image",
                });
                return JSON.stringify({ success: true, message: text || "Image generated successfully." });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : "Image generation failed";
                return JSON.stringify({ success: false, message: msg });
            }
        }
        case "generate_infographic": {
            const { title, steps } = input;
            try {
                const stepDescriptions = steps
                    .map((s) => `Step ${s.number}: "${s.label}" — ${s.detail}`)
                    .join("\n");
                const prompt = `Create a clean, professional vertical infographic titled "${title}".
Layout: numbered steps flowing top to bottom, each with a small icon/illustration and text label.
Steps:
${stepDescriptions}
Style: flat design, warm color palette with Cornell red (#B31B1B) accents, white background, clear numbered circles, simple tool/object illustrations beside each step. Make it easy to read at phone screen size. Do NOT include any watermarks or logos.`;
                const { imageBase64, mimeType, text } = await generateImage(prompt);
                images.push({
                    base64: imageBase64,
                    mimeType,
                    caption: text || `Infographic: ${title}`,
                });
                return JSON.stringify({ success: true, message: text || "Infographic generated." });
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : "Infographic generation failed";
                return JSON.stringify({ success: false, message: msg });
            }
        }
        case "suggest_followups": {
            const s = input.suggestions;
            suggestions.push(...s);
            return JSON.stringify({ suggestions: s, done: true });
        }
        default:
            return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
}
// ── Main chat function ──────────────────────────────────────────────
const MAX_STEPS = 5;
export async function chat(params) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    const client = new Anthropic({ apiKey });
    // Build context
    let systemPrompt;
    let resolvedTools = [];
    if (params.tool_id) {
        // Tool-specific chat
        const tool = await getTool(params.tool_id);
        if (!tool)
            throw new Error(`Tool not found: ${params.tool_id}`);
        const docSources = [
            { label: "Safety Document", url: tool.safety_doc_url },
            { label: "Operating Manual / SOP", url: tool.sop_url },
            { label: "Video Tutorial", url: tool.video_url },
        ].filter((d) => d.url);
        const docs = (await Promise.all(docSources.map(async (d) => {
            const text = await fetchDocContent(d.url);
            return text ? { label: d.label, url: d.url, text } : null;
        }))).filter(Boolean);
        systemPrompt = buildToolSystemPrompt(tool, docs);
        resolvedTools = [tool]; // For tool lookup within the conversation
    }
    else {
        // General chat — load full inventory
        resolvedTools = await listTools();
        systemPrompt = buildGeneralSystemPrompt(resolvedTools);
    }
    // Build message history
    const messages = [];
    if (params.history) {
        for (const msg of params.history) {
            messages.push({ role: msg.role, content: msg.content });
        }
    }
    messages.push({ role: "user", content: params.message });
    // Agentic tool-calling loop
    const collectedImages = [];
    const collectedSuggestions = [];
    // Select which tools to offer — tool-specific mode skips inventory-browsing tools
    const tools = params.tool_id
        ? CHAT_TOOLS.filter((t) => t.name !== "get_tool_details" && t.name !== "visualize_project" && t.name !== "generate_infographic")
        : CHAT_TOOLS;
    for (let step = 0; step < MAX_STEPS; step++) {
        const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: systemPrompt,
            messages,
            tools,
        });
        // Collect text parts
        const textParts = [];
        const toolUses = [];
        for (const block of response.content) {
            if (block.type === "text") {
                textParts.push(block.text);
            }
            else if (block.type === "tool_use") {
                toolUses.push({
                    id: block.id,
                    name: block.name,
                    input: block.input,
                });
            }
        }
        // If no tool calls, we're done
        if (toolUses.length === 0 || response.stop_reason === "end_turn") {
            if (toolUses.length === 0) {
                return {
                    response: textParts.join("\n\n"),
                    suggestions: collectedSuggestions,
                    images: collectedImages,
                };
            }
        }
        // Execute tool calls and build tool_result message
        // First, push the assistant message with its content (text + tool_use blocks)
        messages.push({ role: "assistant", content: response.content });
        const toolResults = [];
        for (const tu of toolUses) {
            const result = await executeTool(tu.name, tu.input, resolvedTools, collectedImages, collectedSuggestions);
            toolResults.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: result,
            });
        }
        messages.push({ role: "user", content: toolResults });
        // If stop_reason was end_turn (model finished, even though it had tool calls),
        // return what we have
        if (response.stop_reason === "end_turn") {
            return {
                response: textParts.join("\n\n"),
                suggestions: collectedSuggestions,
                images: collectedImages,
            };
        }
    }
    // Max steps reached — return whatever we have
    const lastAssistant = messages
        .filter((m) => m.role === "assistant")
        .pop();
    let finalText = "";
    if (lastAssistant && Array.isArray(lastAssistant.content)) {
        for (const block of lastAssistant.content) {
            if (typeof block === "object" && "type" in block && block.type === "text" && "text" in block) {
                finalText += block.text;
            }
        }
    }
    else if (lastAssistant && typeof lastAssistant.content === "string") {
        finalText = lastAssistant.content;
    }
    return {
        response: finalText || "I wasn't able to complete my response. Please try again.",
        suggestions: collectedSuggestions,
        images: collectedImages,
    };
}
