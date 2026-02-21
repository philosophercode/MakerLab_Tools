# V4 MakerLab Tools App — Feature Design

## Overview

Five features to evolve the V3 app: richer visuals, persistent and image-capable chat, community-driven content correction, and AI-powered project planning.

## 1. Expanded Color Palette

Add 2-3 accent colors alongside Cornell Red to give the UI more depth.

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Primary | Cornell Red | `#B31B1B` | Buttons, active states, brand (unchanged) |
| Accent 1 | Warm Teal | `#0D9488` | AI chat bubbles, project planner, info states |
| Accent 2 | Slate Blue | `#6366F1` | Secondary links, material/category chips, tags |
| Accent 3 | Warm Amber | `#D97706` | Flag buttons, attention badges, warning states |

Added as CSS variables + Tailwind theme tokens following the existing pattern in `globals.css`. Cornell red stays dominant — accents add depth without competing.

**Where they appear:**
- Teal: AI message bubbles (replacing current grey), planner accent
- Slate blue: secondary links, chips, tool tags
- Amber: flag icons, suggested-fix indicators, attention states

## 2. Chat Persistence

Conversations persist across navigation and page refresh using React context + localStorage.

**Architecture:**
- `ChatProvider` wraps the app in root layout
- Conversations keyed by type: `general`, `tool:{id}`, `planner`
- Syncs to localStorage on every message update
- Hydrates from localStorage on mount
- Each conversation stores: messages array + last updated timestamp

**Behavior:**
- Navigate between pages — conversations preserved
- Refresh — conversations reload from localStorage
- "New conversation" button in chat header to clear
- Auto-prune oldest conversations if storage exceeds ~2MB

**Changes:**
- New `ChatProvider` context component
- `Chat.tsx` reads/writes via context instead of standalone `useChat` state
- Clear/new conversation button in chat header

## 3. Chat Photo Upload (Vision)

Users can send photos in chat for tool identification or problem diagnosis.

**UI:**
- Camera/photo button next to text input
- Click to select or drag-and-drop onto input area
- Thumbnail preview above input before sending
- Photos appear inline in sent message bubbles

**Backend:**
- Client converts image to base64, includes in message content
- Chat API route constructs multi-part content: `[{ type: "image", ... }, { type: "text", ... }]`
- Claude processes natively via vision — no extra services

**Use cases:**
- "What is this machine?" + photo — AI identifies from inventory
- "Is this normal?" + photo — AI diagnoses, suggests maintenance report
- Photo alone — AI describes what it sees and offers help

**Constraints:**
- 1 photo per message max
- 5MB limit, JPEG/PNG/WebP/HEIC accepted

## 4. Flagging System

Community-driven content correction for AI-generated descriptions and images.

**New AirTable table: `Flags`**

| Field | Type | Notes |
|-------|------|-------|
| tool_id | Link to Tools | Which tool is flagged |
| field_flagged | Single select | description, image, name, category, location, materials, safety_info |
| issue_description | Long text | "What's wrong?" |
| suggested_fix | Long text | "What should it say instead?" |
| reporter | Short text | Name or NetID (optional) |
| status | Single select | New, Reviewed, Fixed, Dismissed |
| created_at | Date | Auto-set on creation |

**UI:**
- Flag icon on hover/focus next to each content section on tool detail page
- Clicking opens compact inline form: field selector + issue description + suggested fix + optional name
- Submits to `/api/flag` endpoint
- Success toast confirmation

**Admin workflow:**
- Review flags in AirTable directly (filter status = "New")
- Fix content, mark as Fixed or Dismissed
- No admin UI in the app

## 5. Project Planner

Guided AI conversation that helps students plan builds using MakerLab tools.

**Entry point:**
- Nav item: "Plan a Project"
- Route: `/plan`
- Same `Chat` component with `mode="planner"` prop

**System prompt approach:**
- Full tool inventory included (same as general chat)
- Instructions for guided conversation flow:
  1. "What are you trying to make?"
  2. Clarifying questions: material, dimensions, precision, skill level, timeline
  3. Structured plan: tools in order, materials needed, safety requirements, estimated time per step
- Plans reference specific MakerLab tools by name with links

**Suggestion chips:**
- "I want to build something" / "Help me pick a material" / "What can I make here?"

**Persistence:**
- Stored under `planner` key in ChatProvider — separate from general and tool chats

## Dependencies

No new packages expected. Vercel AI SDK already supports multi-part content (images). AirTable client already handles table creation.

## Build Sequence

| Step | Feature | Key files |
|------|---------|-----------|
| 1 | Color palette | `globals.css`, components using new tokens |
| 2 | Chat persistence | `ChatProvider.tsx`, `Chat.tsx`, `layout.tsx` |
| 3 | Photo upload in chat | `Chat.tsx`, `api/chat/route.ts` |
| 4 | Flagging system | AirTable setup, `api/flag/route.ts`, `FlagButton.tsx`, tool detail page |
| 5 | Project planner | `/plan/page.tsx`, `api/chat/route.ts` (planner prompt), `Chat.tsx` (mode prop) |
