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
                name=fields.get('Name', 'Unknown'),
                description=fields.get('Description'),
                images=[img['url'] for img in fields.get('Images', [])] if 'Images' in fields else [],
                manual_attachments=fields.get('Manual Attachments', []),
                gemini_resource_ids=fields.get('Gemini_Resource_Ids')
            ))
        return tools

    def get_tool_by_id(self, tool_id: str) -> Optional[Tool]:
        try:
            record = self.table.get(tool_id)
            fields = record.get('fields', {})
            return Tool(
                id=record['id'],
                name=fields.get('Name', 'Unknown'),
                description=fields.get('Description'),
                images=[img['url'] for img in fields.get('Images', [])] if 'Images' in fields else [],
                manual_attachments=fields.get('Manual Attachments', []),
                gemini_resource_ids=fields.get('Gemini_Resource_Ids')
            )
        except Exception:
            return None

    def update_tool_gemini_ids(self, tool_id: str, gemini_ids: str):
        self.table.update(tool_id, {"Gemini_Resource_Ids": gemini_ids})

