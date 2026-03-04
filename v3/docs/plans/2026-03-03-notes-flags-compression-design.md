# Design: Notes Column, Flags Table Setup, and Chat Image Compression

**Date:** 2026-03-03

## Feature 1: User-Visible Notes Column on Tools Table

**Goal:** Add a `notes` field to the Tools table in Airtable and display it on the tool detail page. Notes are user-visible extra info (tips, quirks, known issues).

### Data layer

- Add `notes` field to Airtable Tools table (`tblXHIT0mN2nOzdhd`) as `multilineText`
- Create a setup script `setup_notes_field.py` that uses the Airtable meta API to add the field
- Add `notes?: string` to `ToolFields` in `types.ts`
- Add `notes: string | null` to `ToolWithMeta` in `types.ts`
- Map `notes` in `resolveTools()` in `airtable.ts`: `notes: tool.fields.notes || null`

### UI

- Display on tool detail page (`tools/[id]/page.tsx`) below the description, before safety badges
- Follow the same pattern as `use_restrictions`: label + `whitespace-pre-wrap` text
- Only render when notes is non-null/non-empty
- No FlagButton needed for notes (it's supplementary info, not core data)

### MCP server

- Add `notes` to the tool schema in `v3/mcp/src/index.ts` so Claude can reference notes in chat

## Feature 2: Create Flags Table in Airtable

**Goal:** Run the existing `setup_flags_table.py` script to create the Flags table, then update the placeholder table ID in the codebase.

### Steps

1. Run `python v3/scripts/setup_flags_table.py`
2. Copy the returned table ID
3. Replace `tblTODO_RUN_SETUP_FLAGS` with the real ID in `v3/app/src/lib/airtable.ts`
4. Add the Flags table ID to `CLAUDE.md` under AirTable IDs
5. Verify by testing the flag button on a tool detail page

## Feature 3: More Aggressive Chat Image Compression

**Goal:** Ensure iPhone/Mac photos reliably fit under the 200KB API payload limit by compressing more aggressively in the browser.

### Changes to `compressImageToDataUrl()` in `Chat.tsx`

| Parameter | Current | New |
|-----------|---------|-----|
| `MAX_DIMENSION` | 1600px | 1024px |
| `MAX_SIZE_BYTES` | 900,000 | 150,000 |
| Quality levels | `[0.82, 0.72, 0.62, 0.52, 0.42]` | `[0.7, 0.5, 0.35, 0.2]` |
| Skip compression threshold | `file.size <= MAX_SIZE_BYTES` | `file.size <= MAX_SIZE_BYTES` (same logic, lower threshold) |

### Rationale

- 1024px is sufficient for Claude's vision analysis (it downscales anyway)
- 150KB target leaves 50KB headroom under the 200KB API limit for the JSON wrapper + text
- Quality 0.2 is a last resort; most iPhone photos will compress to <150KB at quality 0.5 with 1024px max dimension
- All compression happens client-side before the API call, so no server changes needed

## Files Modified

| File | Change |
|------|--------|
| `v3/scripts/setup_notes_field.py` | **New** - adds `notes` field to Tools table |
| `v3/app/src/lib/types.ts` | Add `notes` to `ToolFields` and `ToolWithMeta` |
| `v3/app/src/lib/airtable.ts` | Map `notes` in `resolveTools()`, update flags table ID |
| `v3/app/src/app/tools/[id]/page.tsx` | Render notes section |
| `v3/app/src/components/Chat.tsx` | Adjust compression constants |
| `v3/mcp/src/index.ts` | Add `notes` to tool schema |
| `CLAUDE.md` | Add Flags table ID |

## Out of Scope

- Markdown rendering for notes (plain text with whitespace preservation is consistent with the rest of the app)
- Editing notes from the UI (notes are managed in Airtable directly)
- Changing the 200KB API payload limit (compression alone solves the problem)
