# Architecture Review: MakerLab Tools

*February 2026 — Full codebase review across v0–v3*

---

## What You've Built

A digital inventory and discovery system for ~101 tools across 3 rooms in the
Cornell MakerLab. Core use cases:

1. **Browse/search** tools by name, category, room, materials
2. **View tool details** — safety, PPE, manuals, SOPs, emergency stop info
3. **AI chat** — ask questions about a tool (powered by Claude)
4. **Maintenance reporting** — students report broken equipment with photos
5. **QR scanning** — scan a physical machine → jump to its page
6. **Unit tracking** — individual physical units (e.g., Prusa #1, Prusa #2)

---

## What's Working Well

### AI Chat (the standout feature)

The chat route (`v3/app/src/app/api/chat/route.ts`) is genuinely well-designed:

- Per-tool system prompts with full metadata
- Document fetching from Google Docs and PDFs at chat time via `doc-fetcher.ts`
- `report_issue` tool use so students can file tickets conversationally
- `get_tool_details` tool for the general chat to drill into specific tools
- Web search fallback via Anthropic's built-in web search tool
- Rate limiting per IP

### Data Model

Five normalized tables with linked records for categories, locations, units, and
maintenance logs. The `resolveTools()` function cleanly denormalizes linked
record IDs into usable objects.

### Maintenance Form

Good UX: tool search → unit selection → photo upload → submit. QR code prefill
via `?unit=` param is a nice touch.

### Data Pipeline

`prepare_tools_v2.py` handles real-world data messiness: name normalization,
materials vocabulary, category classification via regex rules, description
generation from templates. Thorough for 947 lines.

---

## Concerns

### 1. AirTable Is the Wrong Database for This

This is the biggest architectural risk.

| Problem | Detail |
|---------|--------|
| **Rate limiting** | 5 req/sec (free) or 50 req/sec (paid). Home page fetches 3 tables per cache miss. Tool pages fetch 4. Fine at low traffic, breaks under real student load. |
| **URL expiration** | AirTable attachment/image URLs expire after a few hours. `ToolCard` renders `<Image src={tool.image_url}>` — if the ISR-cached page outlives the URL, images break. |
| **Cost** | $20/user/month on paid plans. Awkward dependency for a student-facing tool. |
| **ETL overhead** | The 947-line Python pipeline exists *because* AirTable needs it. The data itself is 101 static tools. |

### 2. Scale Mismatch

101 tools across 3 rooms is a small, slowly-changing dataset.

- The full inventory is ~150KB as JSON
- It fits in a single static file
- It changes rarely enough that a git commit is a reasonable update mechanism
- Client-side search/filter (already done in `HomeClient.tsx`) handles all browsing

The current architecture — AirTable API → server fetch → ISR → client render — is
what you'd build for thousands of items with frequent updates.

### 3. MCP Is Referenced but Not Used

README and CLAUDE.md describe "Claude MCP integration." The actual implementation
is standard Claude tool use via the Vercel AI SDK (`streamText()` with custom
tools). This is simpler and correct. Documentation should match reality.

### 4. Four Versions in the Working Tree

v0/v1/v2 are frozen (~2,500 lines of dead code across Python, Node, FastAPI
stacks). If they're historical reference, they belong in git history (tagged
releases), not in the working tree.

---

## Alternative Approaches

### Option A: Static Catalog + API for Dynamic Features *(recommended)*

Simplest path that preserves everything valuable:

**Browse/search (fully static):**
- Tool data as a JSON import at build time (you already have `tools_v2_data.json`)
- Images in `/public` or on a CDN — Vercel handles this
- Client-side filtering exactly as `HomeClient.tsx` already does
- `next build` → fully static pages. Zero runtime dependencies for browsing.

**AI chat (keep as-is):**
- `route.ts` is good. Claude API is the one thing that genuinely needs a server.
- Tool context from static JSON instead of AirTable

**Maintenance reporting (lightweight backend):**
- Vercel Postgres, or Google Form/Sheets, or keep AirTable for *only* this table
- This is the only genuinely dynamic data

**QR scanning (keep as-is):**
- Scanner component and routing are clean

### Option B: No-Code Catalog + Code for AI

- Notion database or Google Sites for the tool catalog — staff edit directly
- Google Form for maintenance reporting
- Standalone chat widget (small Next.js app) embedded or linked

Less polished. Dramatically simpler to maintain.

### Option C: Reframe Around the Physical Interaction

The most interesting use case isn't browsing on a laptop. It's *standing in front
of a machine and needing to know something*. Reframe the product around QR:

1. Student scans QR code on machine
2. Focused mobile page: safety info, quick-start, "Ask AI," "Report Issue"
3. AI has full context about that machine
4. No browsing catalog needed — discovery happens physically

The `units/[id]/page.tsx` and `scan/page.tsx` routes are already the seed of this.

---

## Post-Review Additions (merged to main since initial review)

Since this review was written, several features were implemented that are worth
noting — they reinforce some findings and shift some priorities:

### Chat Persistence (ChatProvider + localStorage)

Messages now persist across navigation and refresh via a React context +
localStorage store (2MB cap with auto-pruning). This is pragmatic for a
no-auth app, but localStorage has limits: no cross-tab sync, no export,
and images stored as base64 eat into the quota fast.

### Vision / Photo Upload

Students can attach images in chat. Claude's native vision processes them —
useful for "what is this tool?" and "is this damage?". Images are base64-encoded
on the client and stored in localStorage alongside messages, compounding the
storage concern above.

### Content Flagging System

New `Flags` table in AirTable + `/api/flag` route + `FlagButton` component.
Students can flag inaccurate tool data (wrong description, bad image, etc.).
Flags route through AirTable for staff review. Good community-driven QA. The
admin side is manual (AirTable grid view), which is fine for the scale.

### Project Planner (Unified Chat Mode)

The chat component now supports a `planner` mode that guides students through
"what are you making?" → materials → tools → steps → safety. System prompt
includes full inventory context. Previously a separate page, now unified into
the chat component with mode switching. Solid educational UX.

### Expanded Color Palette

Three accent colors (teal, blue, amber) complement the Cornell Red. Applied to
chat bubbles, filter chips, flag buttons, and safety badges. Dark mode variants
included. Accessibility audit still needed (WCAG contrast ratios).

### Implications for This Review

- **AirTable concern is amplified.** Flags table adds a 6th table. The more
  features depend on AirTable, the harder migration becomes. Still recommend
  static JSON for the catalog, with AirTable reserved for dynamic tables
  (maintenance logs, flags).
- **"Machine companion" thesis is strengthened.** Vision + chat persistence +
  project planning all make the QR → mobile interaction richer. This is the
  differentiated path.
- **localStorage is a temporary solution.** If the app gets real usage, chat
  history should move server-side (even a simple KV store on Vercel).

---

## Concrete Recommendations

### Short-Term

1. **Move tool data to static JSON import.** Keep AirTable only for maintenance
   logs. Removes the biggest production risk (rate limiting, URL expiration).

2. **Delete v0/v1/v2 from the working tree.** Tag them in git if you want history.

3. **Update docs to remove MCP references.** You're using Claude tool use, which
   is the right choice. Call it what it is.

### Medium-Term

4. **Decide: catalog app or machine companion app.** The catalog competes with a
   printed poster on the wall. The QR → AI chat → report issue flow is unique.
   Build toward the second.

5. **Pre-fetch documentation at build time** instead of on first chat request.
   Currently `fetchDocContent()` downloads PDFs and Google Docs on the first
   cold-start message. Bundle them at build time for faster AI responses.

---

## Bottom Line

The core concept — students engaging with makerspace equipment through a digital
companion — is solid. The v3 implementation quality is good. The main opportunity
is simplifying the infrastructure so more effort goes into the *experience* rather
than the plumbing. A student standing at a laser cutter, scanning a QR code, and
asking Claude "what settings do I use for 3mm acrylic?" — that's the moment this
project should be optimized for.
