from pydantic import BaseModel
from typing import List, Optional, Any

class Tool(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    images: List[str] = []
    manual_attachments: List[Any] = []  # AirTable attachment objects
    gemini_resource_ids: Optional[str] = None # JSON string or list of IDs

class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = None

