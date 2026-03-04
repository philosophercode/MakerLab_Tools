# CLAUDE.md — MakerLab Tools

## Project Overview

Cornell MakerLab Tools is a digital inventory and discovery system for makerspace
equipment. The app has evolved through four versions (v0-v3). Active development
is in v3/, which uses a hybrid architecture: direct AirTable REST API for browsing
and Claude API with MCP for AI chat and maintenance reporting. The frontend will
be Next.js on Vercel; the data layer is a normalized 5-table AirTable schema.

## Active Development

All new work goes in `v3/`. Do not modify `v0/`, `v1/`, or `v2/` -- they are
frozen previous versions kept for reference.

## AirTable IDs

- Base: `appQv9Q4jm4UzLpFK`
- Tools table: `tblXHIT0mN2nOzdhd` (101 records)
- Categories table: `tblNpVHquh7H0S8Bc` (9 groups, 37 subcategories)
- Locations table: `tblbwtZhuvtuBKlPO` (3 rooms, 7 zones)
- Units table: `tblDtKMcCxTyQbXwi`
- Maintenance_Logs table: `tbl22sgbMLCFbvynl`
- Flags table: `tblAK068QYB0vLopa`
- Verified_QA table: `PLACEHOLDER_RUN_SETUP_SCRIPT` (run `v3/scripts/setup_verified_qa_table.py` to create)

## Environment

The `.env` file is at `v3/scripts/.env` and contains:
- `AIRTABLE_API_KEY` -- personal access token
- `AIRTABLE_BASE_ID` -- should be `appQv9Q4jm4UzLpFK`

## Data Pipeline

```
Excel (form responses)
  --> prepare_tools_v2.py (clean + normalize)
  --> tools_v2_data.json (101 tools, intermediate artifact)
  --> setup_tools_v2.py (create tables + populate AirTable)
  --> AirTable (production data)
```

Images are uploaded separately via `upload_images.py` from `v3/scripts/tool_images/`.

## Key Scripts (v3/scripts/)

- `prepare_tools_v2.py` -- reads Excel, cleans data, outputs tools_v2_data.json
- `setup_tools_v2.py` -- creates Categories/Locations/Tools tables in AirTable
- `setup_units_and_logs.py` -- creates Units and Maintenance_Logs tables
- `upload_images.py` -- uploads tool images to AirTable via content API
- Legacy scripts (setup_airtable.py, setup_tools_v1.py, import_tools.py, migrate_to_tools_v1.py) are kept for reference but should not be run.

## Conventions

- Python scripts use only stdlib: `urllib`, `json`, `os`, `base64`, `csv`.
  Do not add `requests`, `aiohttp`, or other third-party HTTP libraries.
- AirTable image/attachment uploads use JSON + base64 encoding via the content
  API. Do not use multipart form uploads.
- All AirTable fields must have descriptions set via the API. This is enforced
  in the setup scripts.
- Always test AirTable API changes against a staging/dev base before running
  against the production base (`appQv9Q4jm4UzLpFK`).

## Frontend (Planned)

- Next.js + TypeScript in `v3/app/` (not yet created)
- Will be deployed on Vercel
- Will call AirTable REST API directly for browsing (tools, categories, locations)
- Will call Claude API for chat and maintenance features via MCP

## AI Layer

- Claude API with Model Context Protocol (MCP)
- Used for: chat assistant (tool questions), maintenance reporting
- Not used for: basic browsing, search, filtering (those hit AirTable directly)
