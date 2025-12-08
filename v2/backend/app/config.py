import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    AIRTABLE_API_KEY: str
    AIRTABLE_BASE_ID: str
    AIRTABLE_TABLE_NAME: str = "Inventory"
    GEMINI_API_KEY: str
    
    class Config:
        env_file = ".env"

settings = Settings()

