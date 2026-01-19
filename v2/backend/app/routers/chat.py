from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.services.gemini import GeminiService
from app.services.airtable import AirtableService
from pydantic import BaseModel
from typing import Optional

router = APIRouter()
gemini_service = GeminiService()
airtable_service = AirtableService()

class ChatRequest(BaseModel):
    query: str
    tool_id: Optional[str] = None  # <--- CHANGED: Now optional

@router.post("/")
async def chat(request: ChatRequest):
    
    #User is looking at a specific tool
    if request.tool_id:
        tool = airtable_service.get_tool_by_id(request.tool_id)
        if not tool:
            raise HTTPException(status_code=404, detail="Tool not found")
            
        # Get PDFs for this tool
        gemini_ids = tool.gemini_resource_ids
        if not gemini_ids:
            file_ids = []
        else:
            file_ids = [fid.strip() for fid in gemini_ids.split(",") if fid.strip()]
        
        # Context for AI
        system_instruction = f"You are an expert on the {tool.name}. Answer based on the attached manuals."
        
        return StreamingResponse(
            gemini_service.generate_response_stream(
                request.query, 
                file_ids, 
                system_instruction=system_instruction
            ),
            media_type="text/plain"
        )

    #User needs general info/recommendation
    else:
        all_tools = airtable_service.get_all_tools()
        
        inventory_context = "Here is the MakerLab Inventory:\n"
        for t in all_tools:
            inventory_context += f"- {t.name}: {t.description or 'No description'}\n"
            
        system_prompt = (
            "You are the MakerLab General Assistant. "
            "Help the user find the right tool for their project based on the inventory list below.\n\n"
            f"{inventory_context}"
        )
        
        return StreamingResponse(
            gemini_service.generate_response_stream(
                request.query, 
                [], 
                system_instruction=system_prompt
            ),
            media_type="text/plain"
        )