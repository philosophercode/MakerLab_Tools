# Design: MakerLab Tools Analytics

**Date:** 2026-03-03

**Goal:** Add two analytics layers: Vercel Analytics for website traffic metrics, and an Airtable-based event log with tool counters for MakerLab-specific usage insights.

**Audience:** MakerLab staff (day-to-day operational insights) and Cornell administration (impact/engagement reports).

---

## Layer 1: Vercel Web Analytics

**What it provides:** Page views per route, unique visitors, bounce rate, session duration, referrers, geography, device breakdown. Privacy-friendly, no cookies, GDPR-compliant.

**Implementation:** Install `@vercel/analytics`, add `<Analytics />` to root layout. Viewed in Vercel dashboard.

---

## Layer 2: Airtable Event Log + Tool Counters

### Analytics_Events Table

New Airtable table logging discrete user events.

| Field | Type | Description |
|-------|------|-------------|
| `title` | singleLineText | Auto-generated summary (primary field), e.g. "page_view: Prusa i3" |
| `event_type` | singleSelect | One of the event types below |
| `tool` | multipleRecordLinks | Link to Tools table (when event relates to a specific tool) |
| `detail` | singleLineText | Event-specific data (search query, chat excerpt, flagged field) |
| `session_id` | singleLineText | Anonymous random UUID per browser session (no PII) |
| `timestamp` | dateTime | When the event occurred |

### Event Types

| Event | Trigger | Tool linked? | Detail |
|-------|---------|-------------|--------|
| `page_view` | Tool detail page rendered | Yes | — |
| `search` | User filters/searches on home page | No | Search query text |
| `chat_question` | User sends a chat message | Yes (if on tool page) | Question truncated to 200 chars |
| `chat_tool_reference` | Claude references a tool via MCP | Yes | MCP tool call name |
| `flag_submitted` | User submits a flag | Yes | Flagged field name |
| `maintenance_created` | User files a maintenance report | Yes (via unit) | Maintenance type |

### Counter Fields on Tools Table

Added directly to the existing Tools table for quick sorting/filtering.

| Field | Type | Description |
|-------|------|-------------|
| `view_count` | number | Total page views |
| `chat_mention_count` | number | Times asked about or referenced in AI chat |
| `flag_count` | number | Total flags submitted |

Counters are incremented atomically alongside event log writes.

### API Route

**`POST /api/analytics`**
- Accepts a batch of up to 10 events per request
- Rate limited: 20 requests/minute per IP
- Validates event types via Zod schema
- Truncates `detail` to 200 characters
- Creates records in Analytics_Events table
- Increments counter fields on linked Tools records
- Returns `{ success: true, count: N }`

### Client-Side Collector

**`AnalyticsProvider` component** wrapping the app:
- Generates anonymous `session_id` (UUID) on mount, stored in sessionStorage
- Queues events in memory via `trackEvent(type, toolId?, detail?)`
- Flushes queue every 30 seconds via `POST /api/analytics`
- Also flushes on `visibilitychange` (hidden) and `beforeunload`
- Maximum queue size: 50 events (drops oldest if exceeded)

### Server-Side Event Hooks

Events fired from existing API routes (no client involvement):
- **`chat_tool_reference`** — detected in `/api/chat` when Claude calls MCP `get_tool` or `search_tools`
- **`flag_submitted`** — added to existing `/api/flag` route after successful flag creation
- **`maintenance_created`** — added to existing `/api/maintenance` route after successful creation

### Privacy

- No user identifiers or IP addresses stored in Airtable
- Session ID is a random UUID, not linked to any user account
- Chat questions truncated to 200 characters
- Search queries stored as-is (typically short)
- No cookies used (session_id in sessionStorage, cleared on tab close)

### Airtable Row Limits

Free Airtable plan allows ~100K records. At estimated 500 events/day, that's ~200 days. Mitigation options when approaching the limit:
- Archive old events monthly (export CSV, delete from Airtable)
- Aggregate old events into a summary table
- Upgrade Airtable plan

---

## Files to Create/Modify

| File | Change |
|------|--------|
| `v3/scripts/setup_analytics_table.py` | **New** — creates Analytics_Events table |
| `v3/scripts/setup_analytics_counters.py` | **New** — adds counter fields to Tools table |
| `v3/app/src/lib/types.ts` | Add AnalyticsEventFields interface, counter fields to ToolFields |
| `v3/app/src/lib/airtable.ts` | Add analytics table ID, createAnalyticsEvents(), incrementToolCounter() |
| `v3/app/src/app/api/analytics/route.ts` | **New** — batch event ingestion endpoint |
| `v3/app/src/components/AnalyticsProvider.tsx` | **New** — client-side event collector |
| `v3/app/src/app/layout.tsx` | Add `<Analytics />` (Vercel) and `<AnalyticsProvider>` |
| `v3/app/src/app/tools/[id]/page.tsx` | Track `page_view` event |
| `v3/app/src/components/HomeClient.tsx` | Track `search` event (debounced) |
| `v3/app/src/app/api/chat/route.ts` | Track `chat_question` and `chat_tool_reference` |
| `v3/app/src/app/api/flag/route.ts` | Track `flag_submitted` event |
| `v3/app/src/app/api/maintenance/route.ts` | Track `maintenance_created` event |
| `v3/mcp/src/airtable.ts` | Add counter fields to MCP types |
| `CLAUDE.md` | Add Analytics_Events table ID |

## Out of Scope

- Custom analytics dashboard UI (staff use Airtable views and Vercel dashboard)
- User authentication or tracking individual users
- Historical data backfill
- Real-time analytics streaming
