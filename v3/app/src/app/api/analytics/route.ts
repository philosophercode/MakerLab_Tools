import { createAnalyticsEvents, incrementToolCounter } from "@/lib/airtable";
import { rateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const eventSchema = z.object({
  event_type: z.enum([
    "page_view",
    "search",
    "chat_question",
    "chat_tool_reference",
    "flag_submitted",
    "maintenance_created",
  ]),
  tool_id: z
    .string()
    .regex(/^rec[A-Za-z0-9]{14}$/)
    .optional(),
  detail: z.string().max(200).optional(),
  session_id: z.string().max(100).optional(),
});

const batchSchema = z.object({
  events: z.array(eventSchema).min(1).max(10),
});

const COUNTER_MAP: Record<string, "view_count" | "chat_mention_count" | "flag_count"> = {
  page_view: "view_count",
  chat_question: "chat_mention_count",
  chat_tool_reference: "chat_mention_count",
  flag_submitted: "flag_count",
};

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed } = await rateLimitAsync(`analytics:${ip}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { events } = batchSchema.parse(body);

    // Write events to Airtable (fire-and-forget)
    createAnalyticsEvents(events).catch((err) =>
      console.error("Analytics batch write failed:", err)
    );

    // Increment counters for events that have a tool_id and a counter mapping
    for (const event of events) {
      const counterField = COUNTER_MAP[event.event_type];
      if (counterField && event.tool_id) {
        incrementToolCounter(event.tool_id, counterField).catch((err) =>
          console.error("Counter increment failed:", err)
        );
      }
    }

    return Response.json({ success: true, count: events.length });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { success: false, error: err.issues[0].message },
        { status: 400 }
      );
    }
    return Response.json(
      { success: false, error: "Failed to log events" },
      { status: 500 }
    );
  }
}
