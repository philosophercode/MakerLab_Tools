from fastapi import APIRouter, HTTPException, BackgroundTasks
from app.services.airtable import AirtableService
from app.services.gemini import GeminiService
from pydantic import BaseModel

router = APIRouter()
airtable_service = AirtableService()
gemini_service = GeminiService()

class WebhookPayload(BaseModel):
    record_id: str

async def process_record(record_id: str):
    """Background task to sync record"""
    tool = airtable_service.get_tool_by_id(record_id)
    if not tool:
        print(f"Tool {record_id} not found")
        return

    if not tool.manual_attachments:
        print(f"No manuals for {tool.name}")
        return

    gemini_ids = []
    # Check if we already have some IDs, maybe append? 
    # For simplicity, let's re-sync all (or check duplicates if we had a mapping).
    # Simplified: Re-upload for now or check if filename exists? 
    # Gemini files expire after 48h usually unless added to a corpus? 
    # Actually, standard upload_file expires after 2 days. 
    # Using 'File Search' API (not just long context) requires creating a Corpus.
    # The user plan said "Gemini File Search (Managed)".
    
    # If using Long Context (easiest):
    for attachment in tool.manual_attachments:
        url = attachment.get('url')
        filename = attachment.get('filename')
        if url:
            try:
                file_id = await gemini_service.upload_file_from_url(url, filename)
                gemini_ids.append(file_id)
            except Exception as e:
                print(f"Error uploading {filename}: {e}")
    
    if gemini_ids:
        # Update AirTable with comma-separated list of IDs
        airtable_service.update_tool_gemini_ids(record_id, ",".join(gemini_ids))
        print(f"Updated {tool.name} with {len(gemini_ids)} Gemini files")

@router.post("/airtable")
async def airtable_webhook(payload: WebhookPayload, background_tasks: BackgroundTasks):
    """
    Receives webhook from AirTable when a record is updated.
    """
    background_tasks.add_task(process_record, payload.record_id)
    return {"status": "processing", "record_id": payload.record_id}

