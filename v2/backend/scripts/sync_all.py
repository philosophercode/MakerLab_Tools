import asyncio
import sys
import os

# Add backend directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.airtable import AirtableService
from app.routers.webhooks import process_record

async def main():
    print("Starting full sync...")
    service = AirtableService()
    tools = service.get_all_tools()
    
    print(f"Found {len(tools)} tools. Processing...")
    
    for tool in tools:
        print(f"Syncing tool: {tool.name} ({tool.id})")
        # We can reuse the process_record logic
        await process_record(tool.id)
        
    print("Sync complete!")

if __name__ == "__main__":
    asyncio.run(main())

