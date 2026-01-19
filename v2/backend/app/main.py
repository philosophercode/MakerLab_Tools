from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from app.routers import tools, chat, webhooks, maintenance

# Load environment variables (keys)
load_dotenv()

app = FastAPI(title="MakerLab Tools API v2")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(tools.router, prefix="/tools", tags=["tools"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
app.include_router(maintenance.router, prefix="/maintenance", tags=["maintenance"])

@app.get("/")
async def root():
    return {"message": "MakerLab Tools API v2 is running"}