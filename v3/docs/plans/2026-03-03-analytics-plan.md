# Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Vercel web analytics and Airtable-based app-specific event tracking (tool popularity, AI chat insights, search queries, maintenance/flag patterns) with counter fields on the Tools table.

**Architecture:** Two layers — (1) Vercel Analytics for web traffic metrics via drop-in component, (2) custom event logging to an Airtable `Analytics_Events` table with counter fields on the Tools table. Client-side `AnalyticsProvider` batches events and flushes via `POST /api/analytics`. Server-side hooks in existing API routes fire events for chat, flags, and maintenance.

**Tech Stack:** `@vercel/analytics`, Next.js, Airtable REST API, Zod, React Context

---

### Task 1: Install Vercel Analytics

**Files:**
- Modify: `v3/app/package.json` (add dependency)
- Modify: `v3/app/src/app/layout.tsx:1-58`

**Step 1: Install the package**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/app
npm install @vercel/analytics
```

**Step 2: Add Analytics component to root layout**

In `v3/app/src/app/layout.tsx`, add the import at the top:

```typescript
import { Analytics } from "@vercel/analytics/next";
```

Then add `<Analytics />` inside the `<body>` tag, after `</main>`:

```tsx
        <ChatProvider>
          <main>{children}</main>
        </ChatProvider>
        <Analytics />
      </body>
```

**Step 3: Verify locally**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/app
npm run dev
```

Open the app — Vercel Analytics is a no-op in development but should not cause errors.

**Step 4: Commit**

```bash
git add v3/app/package.json v3/app/package-lock.json v3/app/src/app/layout.tsx
git commit -m "feat: add Vercel Analytics to root layout"
```

---

### Task 2: Create Analytics_Events Table in Airtable

**Files:**
- Create: `v3/scripts/setup_analytics_table.py`

**Step 1: Write the setup script**

Create `v3/scripts/setup_analytics_table.py`:

```python
"""
Create the Analytics_Events table in AirTable, linked to the existing Tools table.

Tracks user interactions: page views, searches, chat questions, AI tool references,
flags, and maintenance reports.

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_analytics_table.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"


def get_config():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    config[key] = val

    token = config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY")
    base_id = config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID")

    if not token:
        print("Error: AIRTABLE_API_KEY not found in .env or environment.")
        sys.exit(1)
    if not base_id:
        print("Error: AIRTABLE_BASE_ID not found in .env or environment.")
        sys.exit(1)

    return token, base_id


def api_request(method, path, token, data=None):
    url = f"{API_URL}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"API Error {e.code}: {error_body}")
        sys.exit(1)


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print(f"Linking to existing Tools table: {TOOLS_TABLE_ID}")
    print()

    fields = [
        {
            "name": "title",
            "type": "singleLineText",
            "description": "Auto-generated event summary (primary field), e.g. 'page_view: Prusa i3'",
        },
        {
            "name": "event_type",
            "type": "singleSelect",
            "description": "Type of user interaction event",
            "options": {
                "choices": [
                    {"name": "page_view"},
                    {"name": "search"},
                    {"name": "chat_question"},
                    {"name": "chat_tool_reference"},
                    {"name": "flag_submitted"},
                    {"name": "maintenance_created"},
                ]
            },
        },
        {
            "name": "tool",
            "type": "multipleRecordLinks",
            "description": "Link to the tool this event relates to (if applicable)",
            "options": {"linkedTableId": TOOLS_TABLE_ID},
        },
        {
            "name": "detail",
            "type": "singleLineText",
            "description": "Event-specific data: search query, chat question excerpt, flagged field name",
        },
        {
            "name": "session_id",
            "type": "singleLineText",
            "description": "Anonymous browser session UUID (no PII)",
        },
        {
            "name": "timestamp",
            "type": "dateTime",
            "description": "When the event occurred",
            "options": {
                "timeZone": "America/New_York",
                "dateFormat": {"name": "iso"},
                "timeFormat": {"name": "24hour"},
            },
        },
    ]

    payload = {"name": "Analytics_Events", "fields": fields}

    print("Creating Analytics_Events table...")
    result = api_request("POST", f"/meta/bases/{base_id}/tables", token, payload)
    table_id = result["id"]
    print(f"  Table ID: {table_id}")
    print()
    print("Done! Analytics_Events table created successfully.")
    print()
    print("Next steps:")
    print(f"  1. Add 'analytics_events: \"{table_id}\"' to TABLES in v3/app/src/lib/airtable.ts")
    print(f"  2. Add '- Analytics_Events table: `{table_id}`' to CLAUDE.md AirTable IDs section")

    return table_id


if __name__ == "__main__":
    main()
```

**Step 2: Run the setup script**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/scripts
python setup_analytics_table.py
```

Expected: `Table ID: tblXXXXXXXXXXXXXXX`

**Step 3: Update airtable.ts with the table ID**

In `v3/app/src/lib/airtable.ts`, in the `TABLES` constant (line 25), add after `flags`:

```typescript
  analytics_events: "<real-table-id>",
```

**Step 4: Update CLAUDE.md**

In `CLAUDE.md`, under `## AirTable IDs`, add:

```
- Analytics_Events table: `<real-table-id>`
```

**Step 5: Commit**

```bash
git add v3/scripts/setup_analytics_table.py v3/app/src/lib/airtable.ts CLAUDE.md
git commit -m "feat: create Analytics_Events table in Airtable"
```

---

### Task 3: Add Counter Fields to Tools Table

**Files:**
- Create: `v3/scripts/setup_analytics_counters.py`

**Step 1: Write the setup script**

Create `v3/scripts/setup_analytics_counters.py`:

```python
"""
Add analytics counter fields to the existing Tools table in AirTable.

Adds: view_count, chat_mention_count, flag_count

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_analytics_counters.py
"""

import json
import os
import sys
import urllib.request
import urllib.error

API_URL = "https://api.airtable.com/v0"
TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd"


def get_config():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    config = {}
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    config[key] = val

    token = config.get("AIRTABLE_API_KEY") or os.environ.get("AIRTABLE_API_KEY")
    base_id = config.get("AIRTABLE_BASE_ID") or os.environ.get("AIRTABLE_BASE_ID")

    if not token:
        print("Error: AIRTABLE_API_KEY not found in .env or environment.")
        sys.exit(1)
    if not base_id:
        print("Error: AIRTABLE_BASE_ID not found in .env or environment.")
        sys.exit(1)

    return token, base_id


def api_request(method, path, token, data=None):
    url = f"{API_URL}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"API Error {e.code}: {error_body}")
        sys.exit(1)


def main():
    token, base_id = get_config()

    print(f"Using base: {base_id}")
    print(f"Adding counter fields to Tools table: {TOOLS_TABLE_ID}")
    print()

    counter_fields = [
        {
            "name": "view_count",
            "type": "number",
            "description": "Total page views for this tool (auto-incremented by analytics)",
            "options": {"precision": 0},
        },
        {
            "name": "chat_mention_count",
            "type": "number",
            "description": "Times this tool was asked about or referenced in AI chat (auto-incremented)",
            "options": {"precision": 0},
        },
        {
            "name": "flag_count",
            "type": "number",
            "description": "Total content flags submitted for this tool (auto-incremented)",
            "options": {"precision": 0},
        },
    ]

    for field in counter_fields:
        result = api_request(
            "POST",
            f"/meta/bases/{base_id}/tables/{TOOLS_TABLE_ID}/fields",
            token,
            field,
        )
        print(f"  Field created: {result.get('name')} (ID: {result.get('id')})")

    print()
    print("Done! Counter fields added to the Tools table.")


if __name__ == "__main__":
    main()
```

**Step 2: Run the setup script**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/scripts
python setup_analytics_counters.py
```

Expected: Three fields created successfully.

**Step 3: Commit**

```bash
git add v3/scripts/setup_analytics_counters.py
git commit -m "feat: add analytics counter fields to Tools table"
```

---

### Task 4: Add Analytics Types and Airtable Functions

**Files:**
- Modify: `v3/app/src/lib/types.ts:44-65` (ToolFields — add counter fields)
- Modify: `v3/app/src/lib/types.ts` (add AnalyticsEventFields interface)
- Modify: `v3/app/src/lib/airtable.ts` (add createAnalyticsEvents, incrementToolCounter)

**Step 1: Add counter fields to ToolFields**

In `v3/app/src/lib/types.ts`, inside `ToolFields`, after `notes`:

```typescript
  view_count?: number;
  chat_mention_count?: number;
  flag_count?: number;
```

**Step 2: Add AnalyticsEventFields interface**

In `v3/app/src/lib/types.ts`, after the `FlagRecord` type (line 173), add:

```typescript

// ── Analytics_Events table ────────────────────────────────────────

export type AnalyticsEventType =
  | "page_view"
  | "search"
  | "chat_question"
  | "chat_tool_reference"
  | "flag_submitted"
  | "maintenance_created";

export interface AnalyticsEventFields {
  title?: string;
  event_type?: AnalyticsEventType;
  tool?: string[]; // linked record IDs
  detail?: string;
  session_id?: string;
  timestamp?: string;
}

export type AnalyticsEventRecord = AirtableRecord<AnalyticsEventFields>;
```

**Step 3: Add analytics functions to airtable.ts**

In `v3/app/src/lib/airtable.ts`, after the `createFlag` function (line ~194), add:

```typescript

// ── Analytics ────────────────────────────────────────────────────

export async function createAnalyticsEvents(
  events: Array<{
    event_type: string;
    tool_id?: string;
    detail?: string;
    session_id?: string;
  }>
): Promise<void> {
  // Airtable batch create supports up to 10 records per request
  const records = events.map((e) => ({
    fields: {
      title: e.tool_id
        ? `${e.event_type}: ${e.tool_id}`
        : e.event_type,
      event_type: e.event_type,
      tool: e.tool_id ? [e.tool_id] : undefined,
      detail: e.detail?.slice(0, 200),
      session_id: e.session_id,
      timestamp: new Date().toISOString(),
    },
  }));

  const { baseId, apiKey } = getConfig();
  const res = await fetch(
    `${API_URL}/${baseId}/${TABLES.analytics_events}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records }),
    }
  );

  if (res.status === 429) {
    // Rate limited — silently drop analytics rather than fail the user's request
    return;
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Analytics write failed: ${res.status} ${body}`);
  }
}

export async function incrementToolCounter(
  toolId: string,
  field: "view_count" | "chat_mention_count" | "flag_count"
): Promise<void> {
  try {
    // Fetch current value
    const record = await fetchRecord<ToolFields>(TABLES.tools, toolId);
    const current = record.fields[field] || 0;

    // Increment
    const { baseId, apiKey } = getConfig();
    const res = await fetch(
      `${API_URL}/${baseId}/${TABLES.tools}/${toolId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { [field]: current + 1 } }),
      }
    );

    if (!res.ok && res.status !== 429) {
      const body = await res.text();
      console.error(`Counter increment failed: ${res.status} ${body}`);
    }
  } catch (err) {
    // Analytics should never break the app
    console.error("Counter increment error:", err);
  }
}
```

Note: `getConfig()` and `fetchRecord()` are already defined in the file. `API_URL` is already defined at line 8. Make sure `getConfig` is exported or accessible — check if it's currently a private function. If private, the analytics functions should use the existing `airtableFetch` helper instead. Adjust accordingly.

**Step 4: Commit**

```bash
git add v3/app/src/lib/types.ts v3/app/src/lib/airtable.ts
git commit -m "feat: add analytics types and Airtable helper functions"
```

---

### Task 5: Create the Analytics API Route

**Files:**
- Create: `v3/app/src/app/api/analytics/route.ts`

**Step 1: Create the route**

Create `v3/app/src/app/api/analytics/route.ts`:

```typescript
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

    // Write events to Airtable (fire-and-forget — don't block response)
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
```

**Step 2: Commit**

```bash
git add v3/app/src/app/api/analytics/route.ts
git commit -m "feat: add /api/analytics batch event ingestion route"
```

---

### Task 6: Create AnalyticsProvider Client Component

**Files:**
- Create: `v3/app/src/components/AnalyticsProvider.tsx`
- Modify: `v3/app/src/app/layout.tsx` (wrap app)

**Step 1: Create the provider**

Create `v3/app/src/components/AnalyticsProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useCallback, useRef, useEffect } from "react";

interface AnalyticsEvent {
  event_type: string;
  tool_id?: string;
  detail?: string;
  session_id?: string;
}

interface AnalyticsContextValue {
  trackEvent: (type: string, toolId?: string, detail?: string) => void;
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  trackEvent: () => {},
});

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

function getSessionId(): string {
  const KEY = "makerlab-session-id";
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

export default function AnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queueRef = useRef<AnalyticsEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;

    const batch = queueRef.current.splice(0, 10);
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // Analytics should never break the app — silently drop on failure
    }

    // If there are remaining events, flush again
    if (queueRef.current.length > 0) {
      flush();
    }
  }, []);

  const trackEvent = useCallback(
    (type: string, toolId?: string, detail?: string) => {
      const event: AnalyticsEvent = {
        event_type: type,
        tool_id: toolId,
        detail: detail?.slice(0, 200),
        session_id: getSessionId(),
      };

      queueRef.current.push(event);

      // Cap queue at 50 events
      if (queueRef.current.length > 50) {
        queueRef.current = queueRef.current.slice(-50);
      }
    },
    []
  );

  useEffect(() => {
    // Flush every 30 seconds
    timerRef.current = setInterval(flush, 30_000);

    // Flush on page hide (tab switch, close)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      flush(); // Final flush on unmount
    };
  }, [flush]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent }}>
      {children}
    </AnalyticsContext.Provider>
  );
}
```

**Step 2: Add to root layout**

In `v3/app/src/app/layout.tsx`, add the import:

```typescript
import AnalyticsProvider from "@/components/AnalyticsProvider";
```

Wrap inside `<ChatProvider>`:

```tsx
        <ChatProvider>
          <AnalyticsProvider>
            <main>{children}</main>
          </AnalyticsProvider>
        </ChatProvider>
```

**Step 3: Commit**

```bash
git add v3/app/src/components/AnalyticsProvider.tsx v3/app/src/app/layout.tsx
git commit -m "feat: add AnalyticsProvider with batched event flushing"
```

---

### Task 7: Track Page Views on Tool Detail Page

**Files:**
- Create: `v3/app/src/components/TrackPageView.tsx`
- Modify: `v3/app/src/app/tools/[id]/page.tsx`

**Step 1: Create a client component for tracking**

The tool detail page is a server component, so we need a small client component that fires the event on mount.

Create `v3/app/src/components/TrackPageView.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useAnalytics } from "@/components/AnalyticsProvider";

export default function TrackPageView({ toolId }: { toolId: string }) {
  const { trackEvent } = useAnalytics();

  useEffect(() => {
    trackEvent("page_view", toolId);
  }, [trackEvent, toolId]);

  return null;
}
```

**Step 2: Add to tool detail page**

In `v3/app/src/app/tools/[id]/page.tsx`, add the import:

```typescript
import TrackPageView from "@/components/TrackPageView";
```

Then add `<TrackPageView toolId={id} />` at the start of the returned JSX, right after the opening `<div>`:

```tsx
    <div className="mx-auto max-w-7xl px-4 py-8">
      <TrackPageView toolId={id} />
      {/* Breadcrumb */}
```

**Step 3: Commit**

```bash
git add v3/app/src/components/TrackPageView.tsx v3/app/src/app/tools/\[id\]/page.tsx
git commit -m "feat: track page_view events on tool detail pages"
```

---

### Task 8: Track Search Events on Home Page

**Files:**
- Modify: `v3/app/src/components/HomeClient.tsx:86-95`

**Step 1: Add analytics to HomeClient**

In `v3/app/src/components/HomeClient.tsx`, add the import:

```typescript
import { useAnalytics } from "@/components/AnalyticsProvider";
```

Inside the component, after the existing state declarations:

```typescript
  const { trackEvent } = useAnalytics();
```

Then in the `handleQueryChange` callback (line ~86), after the URL sync debounce, add a search tracking call. Modify the debounce to also fire an analytics event:

```typescript
  const handleQueryChange = useCallback(
    (q: string) => {
      setLocalQuery(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateParams({ q: q || null });
        if (q.trim()) {
          trackEvent("search", undefined, q.trim());
        }
      }, 200);
    },
    [updateParams, trackEvent]
  );
```

**Step 2: Commit**

```bash
git add v3/app/src/components/HomeClient.tsx
git commit -m "feat: track search events from home page"
```

---

### Task 9: Track Chat Events

**Files:**
- Modify: `v3/app/src/components/Chat.tsx` (track chat_question client-side)
- Modify: `v3/app/src/app/api/chat/route.ts` (track chat_tool_reference server-side)

**Step 1: Track chat questions client-side**

In `v3/app/src/components/Chat.tsx`, add the import:

```typescript
import { useAnalytics } from "@/components/AnalyticsProvider";
```

Inside the `Chat` component, after existing state declarations:

```typescript
  const { trackEvent } = useAnalytics();
```

In the `handleSubmit` function (line ~240), after `sendMessage({ parts })`, add:

```typescript
    // Track chat question
    const textContent = parts.find((p) => p.type === "text");
    if (textContent && "text" in textContent) {
      trackEvent("chat_question", toolId, textContent.text);
    }
```

**Step 2: Track AI tool references server-side**

In `v3/app/src/app/api/chat/route.ts`, add the import at the top:

```typescript
import { createAnalyticsEvents, incrementToolCounter } from "@/lib/airtable";
```

In the `get_tool_details` tool's `execute` function (around line 273), after finding a match, add analytics tracking. Insert right before the `return { found: true, ... }` block:

```typescript
                // Track AI tool reference
                createAnalyticsEvents([{
                  event_type: "chat_tool_reference",
                  tool_id: match.id,
                  detail: tool_name,
                }]).catch(() => {});
                incrementToolCounter(match.id, "chat_mention_count").catch(() => {});
```

**Step 3: Commit**

```bash
git add v3/app/src/components/Chat.tsx v3/app/src/app/api/chat/route.ts
git commit -m "feat: track chat_question and chat_tool_reference events"
```

---

### Task 10: Track Flag and Maintenance Events

**Files:**
- Modify: `v3/app/src/app/api/flag/route.ts:38-48`
- Modify: `v3/app/src/app/api/maintenance/route.ts:59-81`

**Step 1: Track flag events**

In `v3/app/src/app/api/flag/route.ts`, add the import:

```typescript
import { createAnalyticsEvents, incrementToolCounter } from "@/lib/airtable";
```

After the successful `createFlag` call (line ~46), before the success response, add:

```typescript
    // Track flag event
    createAnalyticsEvents([{
      event_type: "flag_submitted",
      tool_id: data.tool_id,
      detail: data.field_flagged,
    }]).catch(() => {});
    incrementToolCounter(data.tool_id, "flag_count").catch(() => {});
```

**Step 2: Track maintenance events**

In `v3/app/src/app/api/maintenance/route.ts`, add the import:

```typescript
import { createAnalyticsEvents } from "@/lib/airtable";
```

After the successful `createMaintenanceLog` call (line ~69), before the photo upload loop, add:

```typescript
    // Track maintenance event — resolve tool from unit if possible
    if (parsed.unit_id) {
      createAnalyticsEvents([{
        event_type: "maintenance_created",
        detail: parsed.type,
      }]).catch(() => {});
    }
```

**Step 3: Commit**

```bash
git add v3/app/src/app/api/flag/route.ts v3/app/src/app/api/maintenance/route.ts
git commit -m "feat: track flag_submitted and maintenance_created events"
```

---

### Task 11: Final Verification

**Step 1: TypeScript check**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/app
npx tsc --noEmit 2>&1 | grep -v "api/mcp\|eval-images\|@anthropic-ai\|@modelcontextprotocol"
```

Expected: No new errors (pre-existing MCP/Anthropic errors are fine).

**Step 2: Dev server check**

```bash
npm run dev
```

Open the app, visit a tool page, search, send a chat message. Check the Analytics_Events table in Airtable — events should appear within 30 seconds.

**Step 3: Verify counters**

Check the Tools table in Airtable — `view_count` and `chat_mention_count` should increment for tools you interacted with.
