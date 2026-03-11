import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import { createVerifiedQA } from "@/lib/airtable";
import { rateLimitAsync, getClientIp } from "@/lib/rate-limit";

const feedbackSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      parts: z.array(z.any()).optional(),
      content: z.string().optional(),
    })
  ),
  solutionSummary: z.string().max(500),
  toolId: z.string().optional(),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed } = await rateLimitAsync(`feedback:${ip}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!allowed) {
    return Response.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const data = feedbackSchema.parse(body);

    // Extract the last user question and last assistant answer from messages
    const textMessages = data.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        const text =
          m.parts
            ?.filter(
              (p: { type?: string }) => p.type === "text"
            )
            .map((p: { text?: string }) => p.text || "")
            .join("\n") || m.content || "";
        return { role: m.role, text };
      })
      .filter((m) => m.text.trim());

    // Get the last few exchanges for context (up to last 6 messages)
    const recentExchange = textMessages.slice(-6);
    if (recentExchange.length < 2) {
      return Response.json(
        { error: "Not enough conversation context" },
        { status: 400 }
      );
    }

    const exchangeText = recentExchange
      .map((m) => `${m.role === "user" ? "Student" : "Assistant"}: ${m.text}`)
      .join("\n\n");

    // Use Claude Haiku to summarize into a clean Q&A pair
    const { text: summaryJson } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      prompt: `Summarize this exchange into a concise question and answer for a FAQ document about MakerLab equipment and makerspace tools. The question should be what the student was trying to learn, and the answer should be the key information provided. Also generate a short title (under 60 chars) for this Q&A entry.

Exchange:
${exchangeText}

Return ONLY valid JSON with this exact format, no other text:
{"title": "short title", "question": "the summarized question", "answer": "the summarized answer"}`,
    });

    let parsed: { title: string; question: string; answer: string };
    try {
      parsed = JSON.parse(summaryJson);
    } catch {
      // Try to extract JSON from the response if wrapped in other text
      const jsonMatch = summaryJson.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return Response.json(
          { error: "Failed to parse AI summary" },
          { status: 500 }
        );
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    // Store in Verified_QA table
    const record = await createVerifiedQA({
      title: parsed.title.slice(0, 100),
      question: parsed.question,
      answer: parsed.answer,
      tool: data.toolId ? [data.toolId] : undefined,
      source_summary: data.solutionSummary,
      helpful_count: 1,
      created_at: new Date().toISOString(),
    });

    return Response.json({ success: true, id: record.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { success: false, error: err.issues[0].message },
        { status: 400 }
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to submit feedback";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
