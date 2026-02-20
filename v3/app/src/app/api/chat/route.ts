import { anthropic } from "@ai-sdk/anthropic";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import {
  fetchTool,
  fetchAllCategories,
  fetchAllLocations,
  fetchAllTools,
  fetchAllUnits,
  resolveTools,
  createMaintenanceLog,
} from "@/lib/airtable";
import { fetchDocContent } from "@/lib/doc-fetcher";

export const maxDuration = 30;

function buildToolSystemPrompt(tool: ReturnType<typeof resolveTools>[0], docTexts: string[]) {
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
    prompt += `\n- **Training Required:** Yes — students must complete training before using this tool.`;
  }
  if (tool.authorized_only) {
    prompt += `\n- **Authorization Required:** Yes — only authorized users may operate this tool.`;
  }
  if (tool.use_restrictions) {
    prompt += `\n- **Use Restrictions:** ${tool.use_restrictions}`;
  }
  if (tool.emergency_stop) {
    prompt += `\n- **Emergency Stop:** ${tool.emergency_stop}`;
  }
  if (tool.safety_doc_url) {
    prompt += `\n- **Safety Doc:** ${tool.safety_doc_url}`;
  }
  if (tool.sop_url) {
    prompt += `\n- **SOP:** ${tool.sop_url}`;
  }
  if (tool.video_url) {
    prompt += `\n- **Video Tutorial:** ${tool.video_url}`;
  }

  if (docTexts.length > 0) {
    prompt += `\n\n## Linked Documentation Content\n`;
    prompt += docTexts.join("\n\n---\n\n");
  }

  prompt += `\n\n## Guidelines
- Answer questions about this tool's capabilities, safety, setup, and materials.
- If you reference safety or SOP documents, mention that students should review the linked docs.
- Be concise but thorough. Use bullet points for lists.
- If you don't know something specific about this tool, say so rather than guessing.
- You are speaking to Cornell students who may be beginners.
- If a student reports an issue or problem with equipment, use the report_issue tool to log it. Gather a brief title and description from the conversation. Ask for their name if they haven't provided it.`;

  return prompt;
}

function buildGeneralSystemPrompt(tools: ReturnType<typeof resolveTools>) {
  const inventory = tools
    .map((t) => `- ${t.name} (${t.category_group} — ${t.category_sub}, ${t.location_room})`)
    .join("\n");

  return `You are a helpful assistant for the Cornell MakerLab. You help students find and learn about makerspace equipment.

## Available Equipment (${tools.length} tools)
${inventory}

## Guidelines
- Help students find the right tool for their project.
- When recommending tools, mention their location and any safety requirements.
- Be concise but thorough. Use bullet points for lists.
- When a student asks detailed questions about a specific tool (how to use it, safety, materials, setup), use the get_tool_details tool to fetch full information and documentation before answering. This gives you access to safety docs, SOPs, and detailed specs.
- You are speaking to Cornell students who may be beginners.
- If a student reports an issue or problem with equipment, use the report_issue tool to log it. Gather a brief title and description from the conversation. Ask for their name if they haven't provided it.`;
}

export async function POST(req: Request) {
  try {
  const { messages, toolId }: { messages: UIMessage[]; toolId?: string } =
    await req.json();

  let systemPrompt: string;
  let resolvedTools: ReturnType<typeof resolveTools> = [];

  if (toolId) {
    // Tool-specific chat
    const [toolRecord, categories, locations] = await Promise.all([
      fetchTool(toolId),
      fetchAllCategories(),
      fetchAllLocations(),
    ]);
    const [resolved] = resolveTools([toolRecord], categories, locations);

    // Fetch text content from all linked docs (PDFs, Google Docs, YouTube)
    const docUrls = [resolved.safety_doc_url, resolved.sop_url, resolved.video_url].filter(Boolean) as string[];
    const docTexts = (
      await Promise.all(docUrls.map(fetchDocContent))
    ).filter(Boolean) as string[];

    systemPrompt = buildToolSystemPrompt(resolved, docTexts);
  } else {
    // General chat
    const [tools, categories, locations] = await Promise.all([
      fetchAllTools(),
      fetchAllCategories(),
      fetchAllLocations(),
    ]);
    resolvedTools = resolveTools(tools, categories, locations);
    systemPrompt = buildGeneralSystemPrompt(resolvedTools);
  }

  // Build unit lookup for the report tool (lazy — only fetched if tool is called)
  let unitLabelMap: Map<string, string> | null = null;
  async function getUnitLabelMap() {
    if (unitLabelMap) return unitLabelMap;
    try {
      const units = await fetchAllUnits();
      unitLabelMap = new Map(units.map((u) => [u.fields.unit_label.toLowerCase(), u.id]));
    } catch {
      unitLabelMap = new Map();
    }
    return unitLabelMap;
  }

  const result = streamText({
    model: anthropic("claude-sonnet-4-5-20250929"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      ...(!toolId && {
        get_tool_details: tool({
          description:
            "Fetch detailed information and documentation for a specific tool. Use this when a student asks detailed questions about a tool — how to use it, safety info, materials, etc.",
          inputSchema: z.object({
            tool_name: z
              .string()
              .describe("The name of the tool to look up, e.g. 'Trotec Speedy 400' or 'Prusa MK4S'"),
          }),
          execute: async ({ tool_name }) => {
            const match = resolvedTools.find(
              (t) => t.name.toLowerCase() === tool_name.toLowerCase()
            ) || resolvedTools.find(
              (t) => t.name.toLowerCase().includes(tool_name.toLowerCase())
            );

            if (!match) {
              return { found: false, message: `No tool found matching "${tool_name}".` };
            }

            // Fetch linked docs (PDFs, Google Docs, YouTube transcripts)
            const docUrls = [match.safety_doc_url, match.sop_url, match.video_url].filter(Boolean) as string[];
            const docTexts = (
              await Promise.all(docUrls.map(fetchDocContent))
            ).filter(Boolean) as string[];

            return {
              found: true,
              name: match.name,
              description: match.description,
              category: `${match.category_group} — ${match.category_sub}`,
              location: `${match.location_room} — ${match.location_zone}`,
              materials: match.materials,
              ppe_required: match.ppe_required,
              training_required: match.training_required,
              authorized_only: match.authorized_only,
              use_restrictions: match.use_restrictions || null,
              emergency_stop: match.emergency_stop || null,
              safety_doc_url: match.safety_doc_url || null,
              sop_url: match.sop_url || null,
              video_url: match.video_url || null,
              documentation: docTexts.length > 0 ? docTexts.join("\n\n---\n\n") : null,
              detail_page: `/tools/${match.id}`,
            };
          },
        }),
      }),
      report_issue: tool({
        description:
          "Report an equipment issue or maintenance request. Use this when a student describes a problem with a tool or unit.",
        inputSchema: z.object({
          title: z.string().describe("Brief summary of the issue"),
          description: z.string().describe("Detailed description of the problem"),
          unit_label: z
            .string()
            .optional()
            .describe("Unit label if known, e.g. 'Prusa #1'"),
          priority: z
            .enum(["Critical", "High", "Medium", "Low"])
            .default("Medium")
            .describe("Urgency level"),
          reported_by: z
            .string()
            .optional()
            .describe("Student name or NetID if provided"),
        }),
        execute: async ({ title, description, unit_label, priority, reported_by }) => {
          // Resolve unit label to record ID if provided
          let unitId: string | undefined;
          if (unit_label) {
            const map = await getUnitLabelMap();
            unitId = map.get(unit_label.toLowerCase());
          }

          const record = await createMaintenanceLog({
            title,
            description,
            type: "Issue Report",
            priority,
            status: "Open",
            reported_by: reported_by || undefined,
            unit: unitId ? [unitId] : undefined,
            date_reported: new Date().toISOString().split("T")[0],
          });

          return {
            success: true,
            ticket_id: record.id,
            message: `Issue reported successfully. Ticket ID: ${record.id}`,
          };
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chat request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
