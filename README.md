# MakerLab Tools

A digital tool inventory and discovery system for the Cornell MakerLab. Browse tools, view documentation, and get AI-powered assistance for operating equipment.

[DeepWiki documentation](https://deepwiki.com/philosophercode/MakerLab_Tools)

---

## Repository Structure

This repository contains four iterations of the application, each representing an evolution in features and architecture:

| Version | Stack | Status | Description |
|---------|-------|--------|-------------|
| **[v0](./v0)** | Python, Streamlit | Legacy | Original prototype for proof-of-concept |
| **[v1](./v1)** | Node.js, Express, TypeScript | Legacy | Production web app with search & image proxy |
| **[v2](./v2)** | FastAPI, Next.js, Gemini AI | Stable | AI-powered assistant with RAG capabilities |
| **[v3](./v3)** | Next.js, Claude AI, AirTable | Active | Hybrid browsing + AI chat with MCP integration |

---

## Features by Version

### v0 — Streamlit Prototype
- Simple search interface
- Grid display of tools with images
- Reads from local Excel file
- Google Drive image support

### v1 — Web Application
- Real-time search with typeahead suggestions
- Grid/List view toggle
- CORS-safe image proxy for Google Drive
- Cached Excel data for performance

### v2 — AI-Powered Platform
- **AI Chat Assistant** — Ask questions about any tool, powered by Google Gemini
- **RAG Integration** — AI has context from uploaded PDF manuals
- **QR Code Support** — Scan a code on physical tools to jump directly to its page
- **Maintenance Reporting** — Submit issue tickets for broken tools directly to AirTable
- **AirTable Backend** — Centralized inventory management
- **Webhook Sync** — Auto-upload new manuals to Gemini when AirTable updates

### v3 — Hybrid AI Platform (Active)
- **Hybrid Architecture** — Direct AirTable REST API for browsing, Claude MCP for AI features
- **Normalized Data Model** — 5-table AirTable schema with linked categories, locations, and units
- **Claude AI with MCP** — Chat assistant and maintenance reporting via Model Context Protocol
- **101 Tools** — Full inventory with images, materials, PPE, tags, and linked metadata
- **Unit Tracking** — Individual physical units linked to tool records
- **Maintenance Logs** — Issue tracking linked to specific units
- **Next.js on Vercel** — Frontend deployment (in development)

---

## Quick Start

### Recommended: v3 (Active Development)

v3 uses a hybrid approach: Python scripts manage the AirTable data layer, and a Next.js frontend (in development) will serve the UI.

**Data Pipeline (scripts):**

```bash
cd v3/scripts
cp .env.example .env  # Add your AirTable credentials

# Prepare data from Excel
python prepare_tools_v2.py

# Push to AirTable
python setup_tools_v2.py

# Upload images
python upload_images.py

# Set up Units and Maintenance_Logs tables
python setup_units_and_logs.py
```

**Frontend (coming soon):**

```bash
cd v3/app
npm install
npm run dev
```

### Alternative: v2 (Stable)

```bash
# Backend
cd v2/backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp env.example .env  # Add your API keys
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd v2/frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Legacy: v1

```bash
cd v1/backend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Legacy: v0

```bash
cd v0
pip install -r requirements.txt
streamlit run makerlab_app.py
```

---

## Configuration

### v3 Environment Variables

Create a `.env` file in `v3/scripts/`:

```env
AIRTABLE_API_KEY=patYourRealKeyHere
AIRTABLE_BASE_ID=appYourBaseIdHere
```

The frontend (once built) will use `v3/app/.env.local`:

```env
NEXT_PUBLIC_AIRTABLE_BASE_ID=appYourBaseIdHere
AIRTABLE_API_KEY=patYourRealKeyHere
CLAUDE_API_KEY=sk-ant-YourKeyHere
```

### v2 Environment Variables

**Backend (`v2/backend/.env`):**

```env
AIRTABLE_API_KEY=patYourRealKeyHere
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=Tools
GEMINI_API_KEY=your_gemini_key
```

**Frontend (`v2/frontend/.env.local`):**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### v1 Environment Variables

**Backend (`v1/backend/.env`):**

```env
PORT=3000
EXCEL_FILE_PATH=./data/tools.xlsx
```

---

## Data Sources

| Version | Data Source | Format |
|---------|-------------|--------|
| v0 | Local file | `tools.xlsx` |
| v1 | Local file | `tools.xlsx` |
| v2 | AirTable | Single Tools table + Maintenance_Logs |
| v3 | AirTable | 5-table normalized schema |

### Excel Schema (v0/v1)

| Column | Description |
|--------|-------------|
| `Tool_Name` | Name of the tool |
| `Image_URL` | Direct link or Google Drive URL |
| `Tool_Purpose` | Short description |

### AirTable Schema (v3)

v3 uses a normalized 5-table schema with linked records:

**Table 1: Tools** (101 records)

| Field | Type | Description |
|-------|------|-------------|
| `Name` | Single line text | Tool name |
| `Description` | Long text | Tool description |
| `Categories` | Link to Categories | Linked category/subcategory records |
| `Location` | Link to Locations | Linked room/zone record |
| `Images` | Attachment | Tool product photos |
| `Materials` | Multiple select | Compatible materials |
| `PPE` | Multiple select | Required protective equipment |
| `Tags` | Multiple select | Searchable tags |
| `Quantity` | Number | Number of units available |
| `Requires_Training` | Checkbox | Whether training is required |

**Table 2: Categories** (37 records across 9 groups)

| Field | Type | Description |
|-------|------|-------------|
| `Name` | Single line text | Subcategory name |
| `Group` | Single select | Parent category group |
| `Tools` | Link to Tools | Back-link to tools in this category |

**Table 3: Locations** (7 zones across 3 rooms)

| Field | Type | Description |
|-------|------|-------------|
| `Name` | Single line text | Zone name |
| `Room` | Single select | Room identifier (GH142, GH144, GH146) |
| `Tools` | Link to Tools | Back-link to tools in this location |

**Table 4: Units** (linked to Tools)

| Field | Type | Description |
|-------|------|-------------|
| `Unit_ID` | Single line text | Unique identifier for this physical unit |
| `Tool` | Link to Tools | Which tool this unit belongs to |
| `Serial_Number` | Single line text | Manufacturer serial number |
| `Status` | Single select | Available, In Use, Under Maintenance, Retired |
| `Notes` | Long text | Unit-specific notes |

**Table 5: Maintenance_Logs** (linked to Units)

| Field | Type | Description |
|-------|------|-------------|
| `Unit` | Link to Units | Which unit this log entry is for |
| `Issue` | Long text | Description of the problem |
| `Reported_By` | Single line text | Name of the reporter |
| `Priority` | Single select | Low, Normal, High, Critical |
| `Status` | Single select | Open, In Progress, Resolved |
| `Created` | Date | When the issue was reported |

### AirTable Schema (v2 — Legacy)

**Tools table:** `name`, `description`, `images`, `manual_attachments`, `gemini_resource_ids`

**Maintenance_Logs table:** `Tool_ID` (link), `Issue`, `Reported_By`, `Priority`, `Status`

---

## Architecture

### v3 Architecture

```
┌──────────────┐     ┌──────────────┐
│   Browser    │────>│   Next.js    │
│   (User)     │     │   (Vercel)   │
└──────────────┘     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              v             v             v
       ┌────────────┐ ┌──────────┐ ┌───────────┐
       │  AirTable  │ │  Claude  │ │  Claude   │
       │  REST API  │ │   API    │ │   MCP     │
       │ (browsing) │ │  (chat)  │ │(maintain.)│
       └────────────┘ └──────────┘ └───────────┘
              │
    ┌─────────┼─────────┬───────────┬──────────┐
    v         v         v           v          v
 ┌───────┐┌────────┐┌─────────┐┌───────┐┌─────────┐
 │ Tools ││Categor.││Locations││ Units ││  Maint. │
 │ (101) ││  (37)  ││   (7)   ││       ││  Logs   │
 └───────┘└────────┘└─────────┘└───────┘└─────────┘
```

### v2 Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────>│   Next.js    │────>│   FastAPI    │
│   (User)     │     │   Frontend   │     │   Backend    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          v                      v                      v
                   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
                   │   AirTable   │       │   Gemini     │       │   Webhooks   │
                   │  (Inventory) │       │   (AI/RAG)   │       │  (Auto-sync) │
                   └──────────────┘       └──────────────┘       └──────────────┘
```

For detailed architecture diagrams, see the [v2 README](./v2/README.md).

---

## Deployment

### v3

- **Frontend**: Deploy to [Vercel](https://vercel.com) from `v3/app/`
- **AirTable**: Managed cloud service, no deployment needed
- **Claude API**: Configured via environment variables

### v2

- **Frontend**: Deploy to [Vercel](https://vercel.com) — set `NEXT_PUBLIC_API_URL`
- **Backend**: Deploy to [Railway](https://railway.app) or [Render](https://render.com)
  - Root directory: `v2/backend`
  - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### v1

- Deploy to [Vercel](https://vercel.com) from the `v1/` directory
- Configuration is pre-set in `vercel.json`

---

## QR Code Integration (v2)

Physical tools can have QR codes linking to `/tools/{airtable_record_id}`. When scanned:

1. User lands on the tool's dedicated page
2. Manuals and documentation are immediately accessible
3. AI assistant is ready with full context from the tool's PDFs

---

## License

ISC

---

## Contributing

1. Active development happens in `v3/` — previous versions (`v0/`, `v1/`, `v2/`) are frozen
2. Follow the existing code style and conventions
3. Test locally before submitting
4. Update the relevant README if adding new features
