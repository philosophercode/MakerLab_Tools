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
import { fetchGoogleDocText } from "@/lib/google-docs";

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
- If a student asks about a specific tool, provide what you know and suggest they visit the tool's detail page for more info.
- You are speaking to Cornell students who may be beginners.
- If a student reports an issue or problem with equipment, use the report_issue tool to log it. Gather a brief title and description from the conversation. Ask for their name if they haven't provided it.`;
}

export async function POST(req: Request) {
  const { messages, toolId }: { messages: UIMessage[]; toolId?: string } =
    await req.json();

  let systemPrompt: string;

  if (toolId) {
    // Tool-specific chat
    const [toolRecord, categories, locations] = await Promise.all([
      fetchTool(toolId),
      fetchAllCategories(),
      fetchAllLocations(),
    ]);
    const [tool] = resolveTools([toolRecord], categories, locations);

    // Fetch Google Doc text content for linked docs
    const docUrls = [tool.safety_doc_url, tool.sop_url].filter(Boolean) as string[];
    const docTexts = (
      await Promise.all(docUrls.map(fetchGoogleDocText))
    ).filter(Boolean) as string[];

    systemPrompt = buildToolSystemPrompt(tool, docTexts);
  } else {
    // General chat
    const [tools, categories, locations] = await Promise.all([
      fetchAllTools(),
      fetchAllCategories(),
      fetchAllLocations(),
    ]);
    const resolved = resolveTools(tools, categories, locations);
    systemPrompt = buildGeneralSystemPrompt(resolved);
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
    stopWhen: stepCountIs(3),
  });

  return result.toUIMessageStreamResponse();
}
