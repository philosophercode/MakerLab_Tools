# Airtable Snapshots

This folder stores versioned Airtable artifacts for reversible sync.

Generated files:
- `tools.json`
- `categories.json`
- `locations.json`
- `units.json`
- `sync-state.json`

Commands:
- `npm run sync:pull` pulls Airtable into these JSON snapshots.
- `npm run sync:push -- --dry-run` previews changes from JSON back to Airtable.
- `npm run sync:push` applies JSON changes to Airtable.

Conflict handling on push:
- Default: `--conflict=fail` (safe)
- Optional: `--conflict=git-wins` or `--conflict=airtable-wins`
