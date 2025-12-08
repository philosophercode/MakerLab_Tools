from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.services.gemini import GeminiService
from app.services.airtable import AirtableService
from pydantic import BaseModel

router = APIRouter()
gemini_service = GeminiService()
airtable_service = AirtableService()

class ChatRequest(BaseModel):
    query: str
    tool_id: str

@router.post("/")
async def chat(request: ChatRequest):
    """
    Chat with context of a specific tool.
    """
    tool = airtable_service.get_tool_by_id(request.tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
        
    gemini_ids = tool.gemini_resource_ids
    if not gemini_ids:
        # Fallback if no files: just chat
        file_ids = []
    else:
        file_ids = [fid.strip() for fid in gemini_ids.split(",") if fid.strip()]
    
    # Return streaming response
    return StreamingResponse(
        gemini_service.generate_response_stream(request.query, file_ids),
        media_type="text/plain"
    )

