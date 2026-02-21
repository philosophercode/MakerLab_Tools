# V3 Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 5 enhancements to the MakerLab Tools V3 app — expanded color palette, persistent chat, photo upload in chat (vision), content flagging system, and project planner mode.

**Architecture:** All features build on the existing Next.js 15 + Tailwind 4 + Vercel AI SDK stack. Chat persistence uses React context + localStorage. Vision uses Anthropic's native multi-modal API via Vercel AI SDK. Flagging creates a new AirTable table. Project planner is a new chat mode with a specialized system prompt.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`), AirTable REST API, Zod

**Working directory:** `v3/app/` (all relative paths below are from here)

**Branch:** `v3-enhancements`

**Verification after every task:** `npm run build` must pass (no TypeScript or build errors)

---

## Task 1: Expanded Color Palette — CSS Variables & Theme Tokens

**Files:**
- Modify: `src/app/globals.css`

**Step 1: Add new CSS variables and Tailwind tokens**

Add three accent colors to `:root`, dark mode overrides, and `@theme inline`:

In `globals.css`, add to `:root` block after `--danger`:
```css
  --accent-teal: #0D9488;
  --accent-blue: #6366F1;
  --accent-amber: #D97706;
```

In the `@media (prefers-color-scheme: dark)` `:root` block, add:
```css
    --accent-teal: #2DD4BF;
    --accent-blue: #818CF8;
    --accent-amber: #FBBF24;
```

In the `@theme inline` block, add after `--color-danger`:
```css
  --color-accent-teal: var(--accent-teal);
  --color-accent-blue: var(--accent-blue);
  --color-accent-amber: var(--accent-amber);
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build passes. New color tokens are available as `bg-accent-teal`, `text-accent-blue`, etc.

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add teal, blue, and amber accent colors to palette"
```

---

## Task 2: Apply Accent Colors to Components

**Files:**
- Modify: `src/components/Chat.tsx` — AI bubbles use teal
- Modify: `src/components/SearchAndFilters.tsx` — category/material chips use blue
- Modify: `src/components/SafetyBadges.tsx` — read this file first to understand structure, then apply amber for warning badges

**Step 1: Update AI chat bubbles from grey to teal**

In `src/components/Chat.tsx`, find the assistant message bubble:
```tsx
: "bg-muted-bg"
```
Replace with:
```tsx
: "bg-accent-teal/10 text-foreground"
```

**Step 2: Update filter chips to use blue when active**

In `src/components/SearchAndFilters.tsx`, in the `MultiToggle` component, find:
```tsx
? "bg-cornell-red text-white"
```
Replace with:
```tsx
? "bg-accent-blue text-white"
```

**Step 3: Read SafetyBadges.tsx and apply amber accent**

Read `src/components/SafetyBadges.tsx` first. Look for any warning/caution indicators (PPE, training required). Apply `accent-amber` to the warning-related badges — the exact edit depends on current structure.

Common pattern: training_required or authorized_only badges should use `bg-accent-amber/10 text-accent-amber` instead of the current color.

**Step 4: Verify build and visually check**

Run: `npm run build`
Run: `npm run dev` → check `/chat`, home page filters, and a tool detail page (e.g. `/tools/rec...`) to verify colors render.

**Step 5: Commit**

```bash
git add src/components/Chat.tsx src/components/SearchAndFilters.tsx src/components/SafetyBadges.tsx
git commit -m "feat: apply accent colors to chat bubbles, filter chips, and safety badges"
```

---

## Task 3: Chat Persistence — ChatProvider Context

**Files:**
- Create: `src/components/ChatProvider.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create ChatProvider**

Create `src/components/ChatProvider.tsx`:

```tsx
"use client";

import { createContext, useContext, useCallback, useRef, useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

const STORAGE_KEY = "makerlab-chat";
const MAX_STORAGE_BYTES = 2 * 1024 * 1024; // 2MB

interface ChatStore {
  [conversationId: string]: {
    messages: UIMessage[];
    updatedAt: number;
  };
}

function loadStore(): ChatStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: ChatStore) {
  try {
    const json = JSON.stringify(store);
    // Prune oldest conversations if over budget
    if (json.length > MAX_STORAGE_BYTES) {
      const entries = Object.entries(store).sort(
        ([, a], [, b]) => a.updatedAt - b.updatedAt
      );
      while (entries.length > 1) {
        entries.shift();
        const pruned = Object.fromEntries(entries);
        if (JSON.stringify(pruned).length <= MAX_STORAGE_BYTES) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
          return;
        }
      }
    }
    localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Storage full — clear and continue
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── Singleton store for useSyncExternalStore ────────────────────────

let currentStore: ChatStore = {};
const listeners = new Set<() => void>();

function initStore() {
  currentStore = loadStore();
}

function getSnapshot(): ChatStore {
  return currentStore;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach((l) => l());
}

// ── Context ─────────────────────────────────────────────────────────

interface ChatContextValue {
  getMessages: (conversationId: string) => UIMessage[];
  setMessages: (conversationId: string, messages: UIMessage[]) => void;
  clearConversation: (conversationId: string) => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);
  if (!initialized.current && typeof window !== "undefined") {
    initStore();
    initialized.current = true;
  }

  const store = useSyncExternalStore(subscribe, getSnapshot, () => ({}));

  const getMessages = useCallback(
    (conversationId: string): UIMessage[] => {
      return store[conversationId]?.messages || [];
    },
    [store]
  );

  const setMessages = useCallback(
    (conversationId: string, messages: UIMessage[]) => {
      currentStore = {
        ...currentStore,
        [conversationId]: { messages, updatedAt: Date.now() },
      };
      saveStore(currentStore);
      emitChange();
    },
    []
  );

  const clearConversation = useCallback((conversationId: string) => {
    const { [conversationId]: _, ...rest } = currentStore;
    currentStore = rest;
    saveStore(currentStore);
    emitChange();
  }, []);

  return (
    <ChatContext.Provider value={{ getMessages, setMessages, clearConversation }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatStore() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatStore must be used within ChatProvider");
  return ctx;
}
```

**Step 2: Wrap layout in ChatProvider**

In `src/app/layout.tsx`, add import:
```tsx
import { ChatProvider } from "@/components/ChatProvider";
```

Wrap `<main>` and `<ChatButton />` (everything inside `<body>` after `<header>`) in `<ChatProvider>`:
```tsx
<ChatProvider>
  <main>{children}</main>
  <ChatButton />
</ChatProvider>
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Passes — ChatProvider is a client component wrapping server-rendered children.

**Step 4: Commit**

```bash
git add src/components/ChatProvider.tsx src/app/layout.tsx
git commit -m "feat: add ChatProvider with localStorage persistence"
```

---

## Task 4: Chat Persistence — Integrate with Chat Component

**Files:**
- Modify: `src/components/Chat.tsx`

**Step 1: Connect Chat to ChatProvider**

The Chat component needs a `conversationId` to key its messages. Derive it from props:
- If `toolId` is set: `"tool:{toolId}"`
- If a `mode` prop equals `"planner"`: `"planner"`
- Otherwise: `"general"`

Add `mode` prop to `ChatProps`:
```tsx
interface ChatProps {
  toolId?: string;
  suggestions?: string[];
  header?: string;
  mode?: "general" | "planner";
}
```

Import `useChatStore`:
```tsx
import { useChatStore } from "@/components/ChatProvider";
```

Inside the component, derive `conversationId` and get store methods:
```tsx
const conversationId = toolId ? `tool:${toolId}` : mode === "planner" ? "planner" : "general";
const { getMessages, setMessages, clearConversation } = useChatStore();
const initialMessages = getMessages(conversationId);
```

Pass `initialMessages` to `useChat`:
```tsx
const { messages, sendMessage, stop, status, error } = useChat({
  transport: new DefaultChatTransport({
    api: "/api/chat",
    body: toolId ? { toolId } : mode === "planner" ? { mode: "planner" } : undefined,
  }),
  initialMessages,
});
```

Sync messages to store whenever they change:
```tsx
const prevLengthRef = useRef(initialMessages.length);
useEffect(() => {
  if (messages.length !== prevLengthRef.current && messages.length > 0) {
    setMessages(conversationId, messages);
    prevLengthRef.current = messages.length;
  }
}, [messages, conversationId, setMessages]);
```

Add a "New conversation" button in the header:
```tsx
{header && (
  <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
    <h2 className="font-semibold text-sm">{header}</h2>
    {messages.length > 0 && (
      <button
        type="button"
        onClick={() => {
          clearConversation(conversationId);
          window.location.reload();
        }}
        className="text-xs text-muted hover:text-foreground transition-colors"
      >
        New chat
      </button>
    )}
  </div>
)}
```

**Step 2: Verify build and test persistence**

Run: `npm run build`
Run: `npm run dev` → go to `/chat`, send a message, navigate to `/`, navigate back to `/chat` — messages should still be there. Refresh the page — messages should still be there.

**Step 3: Commit**

```bash
git add src/components/Chat.tsx
git commit -m "feat: persist chat messages across navigation and refresh"
```

---

## Task 5: Photo Upload in Chat — UI

**Files:**
- Modify: `src/components/Chat.tsx`

**Step 1: Add photo upload state and handlers**

Add state for a pending photo attachment above the `useChat` call:
```tsx
const [pendingImage, setPendingImage] = useState<{ file: File; preview: string } | null>(null);
const imageInputRef = useRef<HTMLInputElement>(null);
```

Add handler functions:
```tsx
const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return;
  if (file.size > 5 * 1024 * 1024) return; // 5MB max
  if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
  setPendingImage({ file, preview: URL.createObjectURL(file) });
  if (imageInputRef.current) imageInputRef.current.value = "";
};

const removePendingImage = () => {
  if (pendingImage) {
    URL.revokeObjectURL(pendingImage.preview);
    setPendingImage(null);
  }
};
```

**Step 2: Update handleSubmit to include images**

Modify `handleSubmit` to convert image to base64 data URL and send as experimental attachment:
```tsx
const handleSubmit = async (text: string) => {
  if ((!text.trim() && !pendingImage) || isLoading) return;

  const parts: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string }> = [];

  if (pendingImage) {
    const base64 = await fileToBase64(pendingImage.file);
    parts.push({
      type: "file",
      data: base64,
      mediaType: pendingImage.file.type,
    });
    removePendingImage();
  }

  if (text.trim()) {
    parts.push({ type: "text", text: text.trim() });
  }

  sendMessage({ parts });
  setInput("");
  userScrolledUp.current = false;
  requestAnimationFrame(() => inputRef.current?.focus());
};
```

Add the `fileToBase64` helper (before the component export):
```tsx
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Return full data URL for Vercel AI SDK
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

**Step 3: Add image preview and upload button to the input area**

Add hidden file input and camera button. Before the text input in the form, add the image preview:

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault();
    handleSubmit(input);
  }}
  className="border-t border-card-border p-3"
>
  {/* Pending image preview */}
  {pendingImage && (
    <div className="mb-2 flex items-start gap-2">
      <div className="relative h-16 w-16 flex-shrink-0">
        <img
          src={pendingImage.preview}
          alt="Pending upload"
          className="h-full w-full rounded-lg border border-card-border object-cover"
        />
        <button
          type="button"
          onClick={removePendingImage}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white text-xs"
          aria-label="Remove image"
        >
          &times;
        </button>
      </div>
      <p className="text-xs text-muted pt-1">Image attached</p>
    </div>
  )}

  <input
    ref={imageInputRef}
    type="file"
    accept="image/*"
    onChange={handleImageSelect}
    className="hidden"
  />

  <div className="flex gap-2">
    {/* Camera button */}
    <button
      type="button"
      onClick={() => imageInputRef.current?.click()}
      disabled={isLoading || !!pendingImage}
      className="rounded-lg border border-card-border bg-card-bg px-3 py-2 text-muted transition-colors hover:bg-muted-bg hover:text-foreground disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-cornell-red"
      aria-label="Attach photo"
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </button>

    <input ... /> {/* existing text input */}
    {/* existing send/stop buttons */}
  </div>
</form>
```

**Step 4: Render user images in message bubbles**

In the message rendering loop, handle image parts:
```tsx
{m.parts.map((part, i) => {
  if (part.type === "text") {
    // ... existing text rendering
  }
  if (part.type === "file" && typeof part.mediaType === "string" && part.mediaType.startsWith("image/")) {
    return (
      <img
        key={i}
        src={part.data instanceof URL ? part.data.toString() : `data:${part.mediaType};base64,${part.data}`}
        alt="User uploaded image"
        className="max-h-48 rounded-lg mb-1"
      />
    );
  }
  return null;
})}
```

Note: The exact part types may vary — check `@ai-sdk/react` types for the `UIMessage.parts` union. The `file` type with `data` and `mediaType` is the standard Vercel AI SDK pattern. If the types differ, adapt accordingly.

**Step 5: Verify build**

Run: `npm run build`
Expected: Passes. The Vercel AI SDK `sendMessage` with `parts` containing file types should work with the Anthropic provider's native vision support.

**Step 6: Commit**

```bash
git add src/components/Chat.tsx
git commit -m "feat: add photo upload to chat with vision support"
```

---

## Task 6: Photo Upload in Chat — API Route Support

**Files:**
- Modify: `src/app/api/chat/route.ts`

**Step 1: Verify vision works out of the box**

The Vercel AI SDK with `@ai-sdk/anthropic` should automatically handle image content blocks in the message conversion (`convertToModelMessages`). The `UIMessage` parts with `type: "file"` get converted to Anthropic image content blocks.

Check if the existing `convertToModelMessages(messages)` handles this by running a test: send an image in chat and check server logs.

If it works without changes, skip to Step 3.

**Step 2: (Only if needed) Manually handle image parts**

If `convertToModelMessages` doesn't handle file parts, you may need to manually construct the Anthropic message format. This is unlikely with recent Vercel AI SDK versions but check the error output.

**Step 3: Update system prompts to mention vision**

In `buildToolSystemPrompt`, add to the Guidelines section:
```
- Students may share photos. If they share an image of equipment, identify it from the inventory if possible. If they share an image showing damage or a problem, help diagnose it and suggest filing a maintenance report.
```

In `buildGeneralSystemPrompt`, add to the Guidelines section:
```
- Students may share photos of equipment. Help identify tools from images, diagnose problems shown in photos, or suggest next steps based on what you see.
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: update chat prompts for vision support"
```

---

## Task 7: Flagging System — AirTable Setup Script

**Files:**
- Create: `v3/scripts/setup_flags_table.py` (note: this is outside `v3/app/`, in `v3/scripts/`)

**Step 1: Write setup script**

Create `v3/scripts/setup_flags_table.py` following the same pattern as `setup_units_and_logs.py`. The script should:

1. Create a `Flags` table in the AirTable base with these fields:
   - `tool` — Link to Tools table (`tblXHIT0mN2nOzdhd`)
   - `field_flagged` — Single select: `description`, `image`, `name`, `category`, `location`, `materials`, `safety_info`
   - `issue_description` — Long text
   - `suggested_fix` — Long text
   - `reporter` — Single line text
   - `status` — Single select: `New`, `Reviewed`, `Fixed`, `Dismissed` (default: `New`)
   - `created_at` — Date (include time)

Use the existing scripts as reference for the AirTable Metadata API pattern (stdlib only: `urllib`, `json`, `os`). Include field descriptions.

**Step 2: Run the script**

Run: `cd v3/scripts && python setup_flags_table.py`
Expected: Table created. Note the table ID from output.

**Step 3: Add table ID to codebase**

Add the new Flags table ID to:
- `CLAUDE.md` — in the AirTable IDs section
- `v3/app/src/lib/airtable.ts` — in the `TABLES` constant

**Step 4: Commit**

```bash
git add v3/scripts/setup_flags_table.py v3/app/src/lib/airtable.ts
git commit -m "feat: add Flags AirTable table setup script"
```

---

## Task 8: Flagging System — API Route & AirTable Functions

**Files:**
- Modify: `src/lib/airtable.ts`
- Modify: `src/lib/types.ts`
- Create: `src/app/api/flag/route.ts`

**Step 1: Add Flag types**

In `src/lib/types.ts`, add:
```tsx
// ── Flags table ─────────────────────────────────────────────────────

export type FlaggedField =
  | "description"
  | "image"
  | "name"
  | "category"
  | "location"
  | "materials"
  | "safety_info";

export type FlagStatus = "New" | "Reviewed" | "Fixed" | "Dismissed";

export interface FlagFields {
  tool?: string[]; // linked record IDs
  field_flagged?: FlaggedField;
  issue_description?: string;
  suggested_fix?: string;
  reporter?: string;
  status?: FlagStatus;
  created_at?: string;
}

export type FlagRecord = AirtableRecord<FlagFields>;
```

**Step 2: Add createFlag to airtable.ts**

In `src/lib/airtable.ts`, add import for new types and a `createFlag` function:
```tsx
import type { ..., FlagFields, FlagRecord } from "./types";

export async function createFlag(
  fields: Partial<FlagFields>
): Promise<FlagRecord> {
  return createRecord<FlagFields>(TABLES.flags, fields);
}
```

Don't forget to add `flags: "<TABLE_ID>"` to the `TABLES` constant (using the ID from Task 7).

**Step 3: Create API route**

Create `src/app/api/flag/route.ts`:
```tsx
import { createFlag } from "@/lib/airtable";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const flagSchema = z.object({
  tool_id: z.string().regex(/^rec[A-Za-z0-9]{14}$/, "Invalid tool ID"),
  field_flagged: z.enum([
    "description", "image", "name", "category", "location", "materials", "safety_info",
  ]),
  issue_description: z.string().min(1, "Please describe the issue").max(1000),
  suggested_fix: z.string().max(2000).optional(),
  reporter: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`flag:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!allowed) {
    return Response.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const data = flagSchema.parse(body);

    const record = await createFlag({
      tool: [data.tool_id],
      field_flagged: data.field_flagged,
      issue_description: data.issue_description,
      suggested_fix: data.suggested_fix || undefined,
      reporter: data.reporter || undefined,
      status: "New",
      created_at: new Date().toISOString(),
    });

    return Response.json({ success: true, id: record.id });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { success: false, error: err.errors[0].message },
        { status: 400 }
      );
    }
    return Response.json(
      { success: false, error: "Failed to submit flag" },
      { status: 500 }
    );
  }
}
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/airtable.ts src/app/api/flag/route.ts
git commit -m "feat: add flag API route and AirTable integration"
```

---

## Task 9: Flagging System — UI Component

**Files:**
- Create: `src/components/FlagButton.tsx`
- Modify: `src/app/tools/[id]/page.tsx`

**Step 1: Create FlagButton component**

Create `src/components/FlagButton.tsx`:
```tsx
"use client";

import { useState } from "react";

interface FlagButtonProps {
  toolId: string;
  field: string;
  label?: string;
}

const FIELD_LABELS: Record<string, string> = {
  description: "Description",
  image: "Image",
  name: "Name",
  category: "Category",
  location: "Location",
  materials: "Materials",
  safety_info: "Safety Info",
};

export default function FlagButton({ toolId, field, label }: FlagButtonProps) {
  const [open, setOpen] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  const [suggestedFix, setSuggestedFix] = useState("");
  const [reporter, setReporter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch("/api/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool_id: toolId,
          field_flagged: field,
          issue_description: issueDescription,
          suggested_fix: suggestedFix || undefined,
          reporter: reporter || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setIssueDescription("");
        setSuggestedFix("");
      }
    } catch {
      setResult({ success: false, error: "Network error" });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.success) {
    return (
      <span className="text-xs text-accent-amber">
        Thanks — we'll review this.
      </span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent-amber transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label={`Flag ${label || FIELD_LABELS[field] || field} as incorrect`}
        title="Report incorrect information"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 rounded-lg border border-accent-amber/20 bg-accent-amber/5 p-3 space-y-2"
    >
      <p className="text-xs font-medium text-accent-amber">
        Flag {FIELD_LABELS[field] || field} as incorrect
      </p>
      <textarea
        required
        value={issueDescription}
        onChange={(e) => setIssueDescription(e.target.value)}
        placeholder="What's wrong?"
        rows={2}
        className="w-full rounded border border-card-border bg-card-bg px-2 py-1.5 text-xs placeholder:text-muted focus:border-accent-amber focus:outline-none focus:ring-1 focus:ring-accent-amber resize-none"
      />
      <textarea
        value={suggestedFix}
        onChange={(e) => setSuggestedFix(e.target.value)}
        placeholder="What should it say instead? (optional)"
        rows={2}
        className="w-full rounded border border-card-border bg-card-bg px-2 py-1.5 text-xs placeholder:text-muted focus:border-accent-amber focus:outline-none focus:ring-1 focus:ring-accent-amber resize-none"
      />
      <input
        type="text"
        value={reporter}
        onChange={(e) => setReporter(e.target.value)}
        placeholder="Your name or NetID (optional)"
        className="w-full rounded border border-card-border bg-card-bg px-2 py-1.5 text-xs placeholder:text-muted focus:border-accent-amber focus:outline-none focus:ring-1 focus:ring-accent-amber"
      />
      {result?.error && (
        <p className="text-xs text-danger">{result.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting || !issueDescription.trim()}
          className="rounded bg-accent-amber px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Sending..." : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded px-3 py-1 text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

**Step 2: Add FlagButton to tool detail page**

In `src/app/tools/[id]/page.tsx`, import FlagButton:
```tsx
import FlagButton from "@/components/FlagButton";
```

Add `group` class and FlagButton next to each flaggable section. For example, wrap the description section:
```tsx
<div className="group">
  <h1 className="text-2xl font-bold">
    {tool.name}
    <FlagButton toolId={id} field="name" />
  </h1>
  <div className="relative">
    <p className="mt-2 text-muted leading-relaxed">
      {tool.description}
    </p>
    <FlagButton toolId={id} field="description" />
  </div>
</div>
```

Add similar FlagButton instances next to:
- Image gallery section (`field="image"`)
- Category/location metadata (`field="category"`, `field="location"`)
- Materials section (`field="materials"`)
- Safety badges section (`field="safety_info"`)

Wrap each parent `<div>` with `className="group"` so the flag icon shows on hover.

**Step 3: Verify build and test**

Run: `npm run build`
Run: `npm run dev` → visit a tool detail page, hover over description — flag icon should appear.

**Step 4: Commit**

```bash
git add src/components/FlagButton.tsx "src/app/tools/[id]/page.tsx"
git commit -m "feat: add content flagging UI to tool detail pages"
```

---

## Task 10: Project Planner — Page & Chat Mode

**Files:**
- Create: `src/app/plan/page.tsx`
- Modify: `src/components/NavLinks.tsx`
- Modify: `src/app/api/chat/route.ts`

**Step 1: Create planner page**

Create `src/app/plan/page.tsx`:
```tsx
import Chat from "@/components/Chat";

export const metadata = {
  title: "Plan a Project — MakerLab Tools",
  description: "Describe what you want to build and get a step-by-step plan using MakerLab tools.",
};

export default function PlanPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-[calc(100vh-150px)] rounded-xl border border-card-border bg-card-bg overflow-hidden flex flex-col">
        <Chat
          mode="planner"
          header="Project Planner"
          suggestions={[
            "I want to build something",
            "Help me pick a material",
            "What can I make here?",
            "I have a class project idea",
          ]}
        />
      </div>
    </div>
  );
}
```

**Step 2: Add to nav**

In `src/components/NavLinks.tsx`, add to the `links` array:
```tsx
{ href: "/plan", label: "Plan a Project" },
```

Place it after "Chat" and before "Report Issue".

**Step 3: Add planner system prompt to chat route**

In `src/app/api/chat/route.ts`:

Add a new function `buildPlannerSystemPrompt`:
```tsx
function buildPlannerSystemPrompt(tools: ReturnType<typeof resolveTools>) {
  const inventory = tools
    .map(
      (t) =>
        `- **${t.name}** (${t.category_group} — ${t.category_sub}, ${t.location_room}): ${t.description?.slice(0, 120) || "No description"}${t.materials.length > 0 ? `. Materials: ${t.materials.join(", ")}` : ""}`
    )
    .join("\n");

  return `You are a project planning assistant for the Cornell MakerLab. Your job is to help students plan their builds using the tools and equipment available in the MakerLab.

## Available Equipment (${tools.length} tools)
${inventory}

## Your Process
Guide students through a structured conversation to create a project plan:

1. **Understand the project:** Ask what they want to make. Get a clear picture before suggesting tools.
2. **Clarify constraints:** Ask follow-up questions one at a time:
   - What material are they thinking? (or suggest options based on the project)
   - How precise does it need to be? (rough prototype vs. finished piece)
   - What's their skill level with makerspace tools?
   - Any size constraints or timeline?
3. **Generate a plan:** Once you understand the project, provide a structured plan:
   - **Materials needed** — specific materials and approximate quantities
   - **Tools & steps** — ordered list of MakerLab tools they'll use, with a brief description of what to do at each step. Link to tool detail pages using the format: [Tool Name](/tools/{tool_id})
   - **Safety requirements** — PPE needed, training required, any authorization needed
   - **Estimated time** — rough time per step
   - **Tips** — common mistakes to avoid, helpful techniques

## Guidelines
- Always ask clarifying questions before generating a plan. Don't assume.
- Ask ONE question at a time — don't overwhelm the student.
- Only recommend tools that are in the MakerLab inventory above.
- Be encouraging and supportive — many students are beginners.
- If a project isn't feasible with MakerLab equipment, explain why and suggest alternatives.
- When a student asks detailed questions about a specific tool, use the get_tool_details tool.
- If a student reports an issue with equipment, use the report_issue tool.
- You have access to web search for techniques, material properties, or design tips not covered in the inventory.`;
}
```

Update the POST handler to detect planner mode. In the section where `toolId` is checked, add an else-if for planner mode:

```tsx
const { messages, toolId, mode }: { messages: UIMessage[]; toolId?: string; mode?: string } =
  await req.json();

// ... existing toolId branch ...

if (mode === "planner") {
  const [tools, categories, locations] = await Promise.all([
    fetchAllTools(),
    fetchAllCategories(),
    fetchAllLocations(),
  ]);
  resolvedTools = resolveTools(tools, categories, locations);
  systemPrompt = buildPlannerSystemPrompt(resolvedTools);
} else if (!toolId) {
  // General chat (existing code)
  // ...
}
```

**Step 4: Verify build**

Run: `npm run build`

**Step 5: Verify planner works**

Run: `npm run dev` → navigate to `/plan` → try "I want to build a wooden shelf" → AI should ask clarifying questions, then suggest tools.

**Step 6: Commit**

```bash
git add src/app/plan/page.tsx src/components/NavLinks.tsx src/app/api/chat/route.ts
git commit -m "feat: add project planner mode with guided AI conversation"
```

---

## Task 11: Final Verification & Polish

**Step 1: Full build check**

Run: `npm run build`
Expected: Clean build, no errors.

**Step 2: Manual smoke test**

Test each feature:
1. **Colors:** Check chat page (teal AI bubbles), home page (blue filter chips), tool detail (amber flags)
2. **Chat persistence:** Send messages in `/chat`, navigate away, come back — messages preserved. Refresh — still there. Click "New chat" — cleared.
3. **Photo upload:** In `/chat`, click camera button, attach an image, send with text "What is this?" — AI should describe the image.
4. **Flagging:** Visit any tool detail page, hover over description — flag icon appears. Click it, fill out form, submit — success message shown.
5. **Project planner:** Visit `/plan`, type "I want to build a wooden box" — AI asks clarifying questions.

**Step 3: Final commit if any polish needed**

```bash
git add -A
git commit -m "chore: polish and fix any issues from smoke testing"
```

**Step 4: Push branch**

```bash
git push -u origin v3-enhancements
```
