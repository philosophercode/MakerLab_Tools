from pyairtable import Api
from app.config import settings
from app.models import Tool
from typing import List, Optional

class AirtableService:
    def __init__(self):
        self.api = Api(settings.AIRTABLE_API_KEY)
        self.table = self.api.table(settings.AIRTABLE_BASE_ID, settings.AIRTABLE_TABLE_NAME)

    def get_all_tools(self) -> List[Tool]:
        records = self.table.all()
        tools = []
        for record in records:
            fields = record.get('fields', {})
            tools.append(Tool(
                id=record['id'],
                name=fields.get('name', 'Unknown'), #Note: changed 'Name' to 'name'. Match case with airtable field names.
                description=fields.get('description'), #changed description, and image to lowercase to match airtable field names.
                images=[img['url'] for img in fields.get('images', [])] if 'images' in fields else [],
                manual_attachments=fields.get('Manual Attachments', []),
                gemini_resource_ids=fields.get('Gemini_Resource_Ids')
            ))
        return tools

    def create_maintenance_ticket(self, request: 'MaintenanceRequest') -> dict: #setup for future user system
        maintenance_table = self.api.table(settings.AIRTABLE_BASE_ID, "Maintenance_Logs")
        
        record = maintenance_table.create({
            "Tool_ID": [request.tool_id], 
            "Issue": request.issue_description,
            "Reported_By": request.reported_by,
            "Priority": request.priority,
            "Status": "Open"
        })
        return record

    def get_tool_by_id(self, tool_id: str) -> Optional[Tool]:
        try:
            record = self.table.get(tool_id)
            fields = record.get('fields', {})
            return Tool(
                id=record['id'],
                name=fields.get('name', 'Unknown'),
                description=fields.get('description'),
                images=[img['url'] for img in fields.get('images', [])] if 'images' in fields else [],
                manual_attachments=fields.get('Manual Attachments', []),
                gemini_resource_ids=fields.get('Gemini_Resource_Ids')
            )
        except Exception:
            return None

    def update_tool_gemini_ids(self, tool_id: str, gemini_ids: str):
        self.table.update(tool_id, {"Gemini_Resource_Ids": gemini_ids})

