from fastapi import APIRouter, HTTPException
from app.services.airtable import AirtableService
from app.models import MaintenanceRequest

router = APIRouter()
airtable_service = AirtableService()

@router.post("/", status_code=201)
async def report_issue(request: MaintenanceRequest):
    # 1. Verify the tool exists
    tool = airtable_service.get_tool_by_id(request.tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool ID not found")

    # 2. Create the log in Airtable
    try:
        record = airtable_service.create_maintenance_ticket(request)
        return {"message": "Ticket created successfully", "ticket_id": record['id']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create ticket: {str(e)}")