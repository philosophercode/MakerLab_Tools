# Notes, Flags, and Compression Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a user-visible notes field to the Tools table, activate the flags table in Airtable, and fix chat image compression so iPhone/Mac photos don't exceed the API payload limit.

**Architecture:** Three independent features touching different layers. The notes field threads through Airtable setup script → TypeScript types → resolver → UI → MCP server. Flags just needs the setup script run and one ID swapped. Compression is a client-side-only constant change.

**Tech Stack:** Python (Airtable meta API), TypeScript, Next.js, React

---

### Task 1: Create Flags Table in Airtable

**Files:**
- Run: `v3/scripts/setup_flags_table.py`
- Modify: `v3/app/src/lib/airtable.ts:31` (replace placeholder table ID)
- Modify: `MakerLab_Tools_isaac/CLAUDE.md` (add Flags table ID)

**Step 1: Run the setup script**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/scripts
python setup_flags_table.py
```

Expected output: `Flags: tblXXXXXXXXXXXXXXX` (a real Airtable table ID)

**Step 2: Update the placeholder table ID in airtable.ts**

In `v3/app/src/lib/airtable.ts`, line 31, replace:
```typescript
flags: "tblTODO_RUN_SETUP_FLAGS",
```
with:
```typescript
flags: "<real-table-id-from-step-1>",
```

**Step 3: Add Flags table ID to CLAUDE.md**

In `MakerLab_Tools_isaac/CLAUDE.md`, under `## AirTable IDs`, add:
```
- Flags table: `<real-table-id-from-step-1>`
```

**Step 4: Commit**

```bash
git add v3/app/src/lib/airtable.ts CLAUDE.md
git commit -m "feat: create flags table in Airtable and update table ID"
```

---

### Task 2: Add Notes Field to Airtable Tools Table

**Files:**
- Create: `v3/scripts/setup_notes_field.py`

**Step 1: Write the setup script**

Create `v3/scripts/setup_notes_field.py`:

```python
"""
Add a 'notes' field to the existing Tools table in AirTable.

This adds a multilineText field for user-visible notes (tips, quirks, known issues).

Usage:
  1. Ensure AIRTABLE_API_KEY and AIRTABLE_BASE_ID are set in .env
  2. Run: python setup_notes_field.py
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
    print(f"Adding 'notes' field to Tools table: {TOOLS_TABLE_ID}")
    print()

    field_payload = {
        "name": "notes",
        "type": "multilineText",
        "description": "User-visible notes about this tool (tips, quirks, known issues)",
    }

    result = api_request(
        "POST",
        f"/meta/bases/{base_id}/tables/{TOOLS_TABLE_ID}/fields",
        token,
        field_payload,
    )

    print(f"Field created: {result.get('name')} (type: {result.get('type')})")
    print(f"Field ID: {result.get('id')}")
    print()
    print("Done! The 'notes' field has been added to the Tools table.")


if __name__ == "__main__":
    main()
```

**Step 2: Run the setup script**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/scripts
python setup_notes_field.py
```

Expected output: `Field created: notes (type: multilineText)`

**Step 3: Commit**

```bash
git add v3/scripts/setup_notes_field.py
git commit -m "feat: add notes field to Tools table in Airtable"
```

---

### Task 3: Thread Notes Through TypeScript Types

**Files:**
- Modify: `v3/app/src/lib/types.ts:44-64` (ToolFields interface)
- Modify: `v3/app/src/lib/types.ts:69-93` (ToolWithMeta interface)

**Step 1: Add `notes` to `ToolFields`**

In `v3/app/src/lib/types.ts`, inside the `ToolFields` interface, after line 63 (`manual_attachments`), add:

```typescript
  notes?: string;
```

**Step 2: Add `notes` to `ToolWithMeta`**

In `v3/app/src/lib/types.ts`, inside the `ToolWithMeta` interface, after line 83 (`emergency_stop`), add:

```typescript
  notes: string | null;
```

**Step 3: Map `notes` in `resolveTools()`**

In `v3/app/src/lib/airtable.ts`, inside the `resolveTools()` return object (around line 277), after the `emergency_stop` line, add:

```typescript
      notes: tool.fields.notes || null,
```

**Step 4: Commit**

```bash
git add v3/app/src/lib/types.ts v3/app/src/lib/airtable.ts
git commit -m "feat: add notes field to ToolFields and ToolWithMeta types"
```

---

### Task 4: Display Notes on Tool Detail Page

**Files:**
- Modify: `v3/app/src/app/tools/[id]/page.tsx:84-86` (after description, before safety)

**Step 1: Add notes section**

In `v3/app/src/app/tools/[id]/page.tsx`, after the description `</div>` (line 84) and before the safety badges `<div>` (line 87), add:

```tsx
          {/* Notes */}
          {tool.notes && (
            <div>
              <span className="block text-xs font-medium text-muted mb-1">
                Notes
              </span>
              <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">
                {tool.notes}
              </p>
            </div>
          )}
```

**Step 2: Verify locally**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/app
npm run dev
```

Open a tool detail page — the notes section should only appear if the tool has notes content in Airtable.

**Step 3: Commit**

```bash
git add v3/app/src/app/tools/[id]/page.tsx
git commit -m "feat: display notes on tool detail page"
```

---

### Task 5: Add Notes to MCP Server

**Files:**
- Modify: `v3/mcp/src/airtable.ts:39-57` (ToolFields interface)
- Modify: `v3/mcp/src/airtable.ts:98-116` (ResolvedTool interface)
- Modify: `v3/mcp/src/airtable.ts:274-293` (resolveToolRecord function)

**Step 1: Add `notes` to MCP ToolFields**

In `v3/mcp/src/airtable.ts`, inside `ToolFields` (line 57, after `manual_attachments`), add:

```typescript
  notes?: string;
```

**Step 2: Add `notes` to MCP ResolvedTool**

In `v3/mcp/src/airtable.ts`, inside `ResolvedTool` (after line 116, after `video_url`), add:

```typescript
  notes: string | null;
```

**Step 3: Map `notes` in `resolveToolRecord()`**

In `v3/mcp/src/airtable.ts`, inside `resolveToolRecord()` return object (around line 292, after `video_url`), add:

```typescript
    notes: tool.fields.notes || null,
```

**Step 4: Commit**

```bash
git add v3/mcp/src/airtable.ts
git commit -m "feat: expose notes field in MCP server tool responses"
```

---

### Task 6: Fix Chat Image Compression

**Files:**
- Modify: `v3/app/src/components/Chat.tsx:70-109` (compressImageToDataUrl function)

**Step 1: Update compression constants**

In `v3/app/src/components/Chat.tsx`, in `compressImageToDataUrl()`:

Line 71 — change:
```typescript
  const MAX_DIMENSION = 1600;
```
to:
```typescript
  const MAX_DIMENSION = 1024;
```

Line 72 — change:
```typescript
  const MAX_SIZE_BYTES = 900_000;
```
to:
```typescript
  const MAX_SIZE_BYTES = 150_000;
```

Line 99 — change:
```typescript
  const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];
```
to:
```typescript
  const qualities = [0.7, 0.5, 0.35, 0.2];
```

**Step 2: Verify locally**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/app
npm run dev
```

Test by uploading an iPhone photo in the chat — it should send without a "Payload too large" error.

**Step 3: Commit**

```bash
git add v3/app/src/components/Chat.tsx
git commit -m "fix: compress chat images more aggressively to fit under API payload limit"
```

---

### Task 7: Final Verification

**Step 1: Build check**

```bash
cd /Users/isaacsteinberg/Developer/makerlab_tools_app/MakerLab_Tools_isaac/v3/app
npm run build
```

Expected: no TypeScript errors, clean build.

**Step 2: Verify all three features end-to-end**

1. **Notes**: Open a tool that has notes in Airtable — notes section renders below description
2. **Flags**: Click a flag icon on a tool detail page, submit a flag — should succeed (no "fetch failed" error)
3. **Compression**: Upload a large iPhone photo in chat — should send without payload errors
