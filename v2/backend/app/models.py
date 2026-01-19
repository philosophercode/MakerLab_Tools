from pydantic import BaseModel
from typing import List, Optional, Any

class Tool(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    images: Any = []  
    location: Optional[str] = None
    manual_attachments: List[Any] = []  # AirTable attachment objects
    gemini_resource_ids: Optional[str] = None # JSON string or list of IDs

class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = None

class MaintenanceRequest(BaseModel): #later on for user system
    tool_id: str
    issue_description: str
    reported_by: Optional[str] = "Anonymous" 
    priority: Optional[str] = "Normal" 