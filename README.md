# 🛠️ MakerLab Tools

A digital tool inventory and discovery system for the Cornell MakerLab. Browse tools, view documentation, and get AI-powered assistance for operating equipment.

---

## 📂 Repository Structure

This repository contains three iterations of the application, each representing an evolution in features and architecture:

| Version | Stack | Status | Description |
|---------|-------|--------|-------------|
| **[v0](./v0)** | Python, Streamlit | Legacy | Original prototype for proof-of-concept |
| **[v1](./v1)** | Node.js, Express, TypeScript | Stable | Production web app with search & image proxy |
| **[v2](./v2)** | FastAPI, Next.js, Gemini AI | Active | AI-powered assistant with RAG capabilities |

---

## ✨ Features by Version

### v0 — Streamlit Prototype
- Simple search interface
- Grid display of tools with images
- Reads from local Excel file
- Google Drive image support

### v1 — Web Application
- 🔍 Real-time search with typeahead suggestions
- 📋 Grid/List view toggle
- 🖼️ CORS-safe image proxy for Google Drive
- ⚡ Cached Excel data for performance

### v2 — AI-Powered Platform
- 🤖 **AI Chat Assistant** — Ask questions about any tool, powered by Google Gemini
- 📄 **RAG Integration** — AI has context from uploaded PDF manuals
- 📱 **QR Code Support** — Scan a code on physical tools to jump directly to its page
- ☁️ **AirTable Backend** — Centralized inventory management
- 🔄 **Webhook Sync** — Auto-upload new manuals to Gemini when AirTable updates

---

## 🚀 Quick Start

### Recommended: v2 (Full-Featured)

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

### Alternative: v1 (Lightweight)

```bash
cd v1/backend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Legacy: v0 (Prototype)

```bash
cd v0
pip install -r requirements.txt
streamlit run makerlab_app.py
```

---

## 🔧 Configuration

### v2 Environment Variables

**Backend (`v2/backend/.env`)**
```env
AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=Inventory
GEMINI_API_KEY=your_gemini_key
```

**Frontend (`v2/frontend/.env.local`)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### v1 Environment Variables

**Backend (`v1/backend/.env`)**
```env
PORT=3000
EXCEL_FILE_PATH=./data/tools.xlsx
```

---

## 📊 Data Sources

| Version | Data Source | Format |
|---------|-------------|--------|
| v0 | Local file | `tools.xlsx` |
| v1 | Local file | `tools.xlsx` |
| v2 | AirTable | Cloud-hosted Inventory table |

### Excel Schema (v0/v1)

| Column | Description |
|--------|-------------|
| `Tool_Name` | Name of the tool |
| `Image_URL` | Direct link or Google Drive URL |
| `Tool_Purpose` | Short description |

### AirTable Schema (v2)

| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Tool name |
| Description | Long text | Tool description |
| Images | Attachment | Tool photos |
| Manual Attachments | Attachment | PDF manuals |
| Gemini_Resource_Ids | Text | Auto-populated file IDs |

---

## 🏗️ Architecture (v2)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser    │────▶│   Next.js    │────▶│   FastAPI    │
│   (User)     │     │   Frontend   │     │   Backend    │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          ▼                      ▼                      ▼
                   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
                   │   AirTable   │       │   Gemini     │       │   Webhooks   │
                   │  (Inventory) │       │   (AI/RAG)   │       │  (Auto-sync) │
                   └──────────────┘       └──────────────┘       └──────────────┘
```

For detailed architecture diagrams, see the [v2 README](./v2/README.md).

---

## 🚢 Deployment

### v2

- **Frontend**: Deploy to [Vercel](https://vercel.com) — set `NEXT_PUBLIC_API_URL`
- **Backend**: Deploy to [Railway](https://railway.app) or [Render](https://render.com)
  - Root directory: `v2/backend`
  - Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### v1

- Deploy to [Vercel](https://vercel.com) from the `v1/` directory
- Configuration is pre-set in `vercel.json`

---

## 📱 QR Code Integration (v2)

Physical tools can have QR codes linking to `/tools/{airtable_record_id}`. When scanned:

1. User lands on the tool's dedicated page
2. Manuals and documentation are immediately accessible
3. AI assistant is ready with full context from the tool's PDFs

---

## 📝 License

ISC

---

## 🤝 Contributing

1. Choose the appropriate version directory for your changes
2. Follow the existing code style and conventions
3. Test locally before submitting
4. Update the relevant README if adding new features

