from fastapi import APIRouter, HTTPException
from app.services.airtable import AirtableService
from app.models import Tool
from typing import List

router = APIRouter()
airtable_service = AirtableService()

@router.get("/", response_model=List[Tool])
async def get_tools():
    """List all tools from AirTable"""
    return airtable_service.get_all_tools()

@router.get("/{tool_id}", response_model=Tool)
async def get_tool(tool_id: str):
    """Get a specific tool"""
    tool = airtable_service.get_tool_by_id(tool_id)
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool

