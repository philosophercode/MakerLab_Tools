# MakerLab Tools V2

A modern tool inventory and AI assistant for Cornell MakerLab. Students can browse tools, view manuals, and chat with an AI assistant that has context from the tool's documentation.

## Architecture

- **Frontend**: Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **Backend**: Python FastAPI
- **Database**: AirTable (as CMS and structured data store)
- **AI/RAG**: Google Gemini (File Search / Long Context)

---

### High-Level System Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERACTIONS                             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│    ┌──────────────┐         ┌──────────────┐         ┌──────────────┐      │
│    │  Web Browser │         │  QR Scanner  │         │   Inventory  │      │
│    │   (Student)  │         │   (Mobile)   │         │  (Data Entry)│      │
│    └──────┬───────┘         └──────┬───────┘         └──────┬───────┘      │
│           │                        │                        │              │
└───────────┼────────────────────────┼────────────────────────┼──────────────┘
            │                        │                        │
            ▼                        ▼                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (Vercel)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     Next.js 16 (App Router)                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │  │
│  │  │  Home Page  │  │  Tool Page  │  │  /tools/[id] (QR Landing)   │  │  │
│  │  │  (Grid)     │  │  (Details)  │  │                             │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────┬──────────────────────────────────────┘
                                     │ REST API
                                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Railway/Render)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     FastAPI (Python)                                │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │  │
│  │  │ /tools API  │  │ /chat API   │  │  /webhooks/airtable         │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────────────┬──────────────┘  │  │
│  └─────────┼────────────────┼────────────────────────┼─────────────────┘  │
└────────────┼────────────────┼────────────────────────┼────────────────────┘
             │                │                        │
             ▼                ▼                        ▼
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────────────┐
│     AirTable       │  │   Google Gemini    │  │    AirTable Automation     │
│  ┌──────────────┐  │  │  ┌──────────────┐  │  │  ┌──────────────────────┐  │
│  │  Inventory   │  │  │  │  File API    │  │  │  │ Trigger on Update    │  │
│  │  Table       │◄─┼──┼──│  (PDFs)      │  │  │  │ → Webhook to Backend │  │
│  │              │  │  │  ├──────────────┤  │  │  └──────────────────────┘  │
│  │ - Name       │  │  │  │  Chat API    │  │  └────────────────────────────┘
│  │ - Images     │  │  │  │  (Streaming) │  │
│  │ - Manuals    │  │  │  └──────────────┘  │
│  │ - GeminiIDs  │  │  └────────────────────┘
│  └──────────────┘  │
└────────────────────┘
```

---

### Backend Architecture

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           FastAPI Backend                                 │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                           app/main.py                               │  │
│  │                    FastAPI App + CORS Middleware                    │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│            ┌───────────────────────┼───────────────────────┐              │
│            ▼                       ▼                       ▼              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   tools.py      │    │    chat.py      │    │  webhooks.py    │        │
│  │   /tools        │    │    /chat        │    │  /webhooks      │        │
│  │                 │    │                 │    │                 │        │
│  │ GET /           │    │ POST /          │    │ POST /airtable  │        │
│  │ GET /{id}       │    │                 │    │                 │        │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│           │                      │                      │                 │
│           └──────────────────────┼──────────────────────┘                 │
│                                  │                                        │
│  ┌───────────────────────────────┼───────────────────────────────────┐    │
│  │                         SERVICES                                  │    │
│  │                                                                   │    │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────┐   │    │
│  │  │    airtable.py          │    │      gemini.py              │   │    │
│  │  │    AirtableService      │    │      GeminiService          │   │    │
│  │  │                         │    │                             │   │    │
│  │  │  • get_all_tools()      │    │  • upload_file_from_url()   │   │    │
│  │  │  • get_tool_by_id()     │    │  • chat_with_context()      │   │    │
│  │  │  • update_gemini_ids()  │    │  • generate_response_stream │   │    │
│  │  └────────────┬────────────┘    └─────────────┬───────────────┘   │    │
│  │               │                               │                   │    │
│  └───────────────┼───────────────────────────────┼───────────────────┘    │
│                  │                               │                        │
└──────────────────┼───────────────────────────────┼────────────────────────┘
                   │                               │
                   ▼                               ▼
          ┌────────────────┐              ┌────────────────┐
          │   AirTable     │              │ Google Gemini  │
          │   REST API     │              │     API        │
          │                │              │                │
          │  pyairtable    │              │ google-genai   │
          └────────────────┘              └────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW: Chat Request                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. POST /chat {query, tool_id}                                             │
│           │                                                                 │
│           ▼                                                                 │
│  2. AirtableService.get_tool_by_id(tool_id)                                 │
│           │                                                                 │
│           ▼                                                                 │
│  3. Extract gemini_resource_ids from tool                                   │
│           │                                                                 │
│           ▼                                                                 │
│  4. GeminiService.generate_response_stream(query, file_ids)                 │
│           │                                                                 │
│           ▼                                                                 │
│  5. Stream response chunks back to client                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Frontend Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 Frontend                                 │
│                         (App Router)                                       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  src/                                                                      │
│  ├── app/                          ← App Router (Server Components)        │
│  │   ├── layout.tsx                ← Root layout + metadata                │
│  │   ├── globals.css               ← Global styles + CSS variables         │
│  │   ├── page.tsx                  ← Home page (Tool Grid)                 │
│  │   └── tools/                                                            │
│  │       └── [id]/                                                         │
│  │           └── page.tsx          ← Tool detail page (SSR)                │
│  │                                                                         │
│  ├── components/                   ← Client Components                     │
│  │   ├── Chat.tsx                  ← AI Chat interface                     │
│  │   └── Manuals.tsx               ← PDF manual list                       │
│  │                                                                         │
│  └── lib/                          ← Utilities                             │
│      ├── api.ts                    ← API client functions                  │
│      └── types.ts                  ← TypeScript interfaces                 │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘


┌─────────────────────────────────────────────────────────────────────────────┐
│                           PAGE STRUCTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  HOME PAGE (/)                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Header: MakerLab Tools - Cornell University                          │  │
│  ├───────────────────────────────────────────────────────────────────────┤  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐                   │  │
│  │  │  Tool   │  │  Tool   │  │  Tool   │  │  Tool   │                   │  │
│  │  │  Card   │  │  Card   │  │  Card   │  │  Card   │                   │  │
│  │  │ [Image] │  │ [Image] │  │ [Image] │  │ [Image] │                   │  │
│  │  │  Name   │  │  Name   │  │  Name   │  │  Name   │                   │  │
│  │  │  Desc   │  │  Desc   │  │  Desc   │  │  Desc   │                   │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  TOOL PAGE (/tools/[id])                                                    │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  ← Back   Tool Name                                                   │  │
│  ├────────────────────────────┬──────────────────────────────────────────┤  │
│  │                            │                                          │  │
│  │  ┌──────────────────────┐  │  ┌────────────────────────────────────┐  │  │
│  │  │     Tool Image       │  │  │         AI Assistant               │  │  │
│  │  └──────────────────────┘  │  │  ┌──────────────────────────────┐  │  │  │
│  │                            │  │  │                              │  │  │  │
│  │  ┌──────────────────────┐  │  │  │    Chat Messages Area        │  │  │  │
│  │  │   Description        │  │  │  │                              │  │  │  │
│  │  │   About this tool... │  │  │  │  User: How do I start?       │  │  │  │
│  │  └──────────────────────┘  │  │  │  AI: First, ensure the...    │  │  │  │
│  │                            │  │  │                              │  │  │  │
│  │  ┌──────────────────────┐  │  │  └──────────────────────────────┘  │  │  │
│  │  │   Manuals & Docs     │  │  │  ┌──────────────────────────────┐  │  │  │
│  │  │   ├─ Manual.pdf      │  │  │  │ [Ask a question...]  [Send]  │  │  │  │
│  │  │   └─ Guide.pdf       │  │  │  └──────────────────────────────┘  │  │  │
│  │  └──────────────────────┘  │  └────────────────────────────────────┘  │  │
│  │        LEFT PANE           │            RIGHT PANE                    │  │
│  └────────────────────────────┴──────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT DATA FLOW                                │
├───────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│                    ┌──────────────────────────────┐                       │
│                    │   Server Component (SSR)     │                       │
│                    │   tools/[id]/page.tsx        │                       │
│                    └──────────────┬───────────────┘                       │
│                                   │                                       │
│          ┌────────────────────────┼────────────────────────┐              │
│          │                        │                        │              │
│          ▼                        ▼                        ▼              │
│  ┌───────────────┐      ┌─────────────────┐      ┌─────────────────┐      │
│  │  getTool(id)  │      │   <Manuals />   │      │    <Chat />     │      │
│  │  (lib/api.ts) │      │   (Client)      │      │    (Client)     │      │
│  └───────┬───────┘      │                 │      │                 │      │
│          │              │  Props:         │      │  Props:         │      │
│          ▼              │  - attachments  │      │  - toolId       │      │
│  ┌───────────────┐      │                 │      │  - toolName     │      │
│  │ FastAPI       │      │  Renders:       │      │                 │      │
│  │ GET /tools/id │      │  - PDF links    │      │  State:         │      │
│  └───────────────┘      └─────────────────┘      │  - messages[]   │      │
│                                                  │  - input        │      │
│                                                  │  - isLoading    │      │
│                                                  │                 │      │
│                                                  │  Streaming:     │      │
│                                                  │  POST /chat →   │      │
│                                                  │  ReadableStream │      │
│                                                  └─────────────────┘      │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- AirTable account with API access
- Google AI Studio API key (Gemini)

### Backend Setup

```bash
cd v2/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file from example
cp env.example .env
# Edit .env with your API keys

# Run the server
uvicorn app.main:app --reload --port 8000
```

### Frontend Setup

```bash
cd v2/frontend

# Install dependencies
npm install

# Create .env.local (optional, defaults to localhost:8000)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## AirTable Configuration

Create a table named `Inventory` with the following fields:

| Field Name          | Type             | Description                   |
| ------------------- | ---------------- | ----------------------------- |
| Name                | Single line text | Tool name                     |
| Description         | Long text        | Tool description              |
| Images              | Attachment       | Tool images                   |
| Manual Attachments  | Attachment       | PDF manuals                   |
| Gemini_Resource_Ids | Single line text | Auto-populated by sync script |

### Setting up AirTable Automation (Optional)

To automatically sync new PDFs to Gemini:

1. Go to your AirTable base → Automations
2. Create a new automation
3. Trigger: "When a record is updated" (filter on Manual Attachments field)
4. Action: "Run a script" or "Send webhook"
5. Webhook URL: `https://your-backend-url/webhooks/airtable`
6. Payload: `{"record_id": "{record_id}"}`

## Syncing All Tools

To manually sync all tools and upload their PDFs to Gemini:

```bash
cd v2/backend
python scripts/sync_all.py
```

## API Endpoints

| Endpoint               | Method | Description               |
| ---------------------- | ------ | ------------------------- |
| `/tools`             | GET    | List all tools            |
| `/tools/{id}`        | GET    | Get a specific tool       |
| `/chat`              | POST   | Chat with AI about a tool |
| `/webhooks/airtable` | POST   | Receive AirTable webhook  |

## Environment Variables

### Backend (.env)

```
AIRTABLE_API_KEY=your_airtable_key
AIRTABLE_BASE_ID=your_base_id
AIRTABLE_TABLE_NAME=Inventory
GEMINI_API_KEY=your_gemini_key
```

### Frontend (.env.local)

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Deployment

### Frontend (Vercel)

1. Push to GitHub
2. Import project in Vercel
3. Set `NEXT_PUBLIC_API_URL` environment variable to your backend URL

### Backend (Railway/Render)

1. Create a new service
2. Connect your repository
3. Set the root directory to `v2/backend`
4. Set environment variables
5. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## QR Code Integration

Each tool can have a QR code that links directly to `/tools/{airtable_record_id}`.
When scanned, users are taken directly to that tool's page with all manuals and AI chat ready.
