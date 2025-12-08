import google.generativeai as genai
from app.config import settings
import httpx
import tempfile
import os
from typing import List

genai.configure(api_key=settings.GEMINI_API_KEY)

class GeminiService:
    def __init__(self):
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    async def upload_file_from_url(self, file_url: str, filename: str) -> str:
        """Downloads file from URL and uploads to Gemini. Returns Gemini File ID."""
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            response.raise_for_status()
            
            # Create a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name

            try:
                # Upload to Gemini
                uploaded_file = genai.upload_file(path=temp_path, display_name=filename)
                
                # Wait for processing? Usually fast for small files, but good to check state if needed.
                # For now return the name (URI/ID)
                return uploaded_file.name
            finally:
                os.unlink(temp_path)

    async def chat_with_context(self, query: str, file_ids: List[str]):
        """
        Chat with context from specific files. 
        Note: Gemini 1.5 allows passing files directly in the generate_content call or chat history.
        """
        # Retrieve file objects (or just pass names if supported by SDK version, usually need file objects)
        # The SDK expects 'types.File' objects or their names in some contexts.
        # Let's try passing the file names directly in the request or fetching them first if needed.
        # For 'tools=[file_search_tool]', it's slightly different (Managed RAG).
        # But here we might just want to use the long context window of 1.5 Flash.
        
        # If using File Search (Retriever), we need to create a Corpus or use the ad-hoc file list.
        # Simple approach for V2: Pass files to the model's generation request (Long Context).
        
        # Fetch file metadata if needed, but the 'name' (files/...) is usually enough for the SDK part list.
        
        # Construct content parts
        parts = []
        for file_name in file_ids:
             # We need to get the file object or just pass the logic.
             # The SDK allows passing the file object returned by get_file, or just the result of upload.
             # Let's fetch the file object to be safe.
             try:
                 file_obj = genai.get_file(file_name)
                 parts.append(file_obj)
             except Exception as e:
                 print(f"Error fetching file {file_name}: {e}")
        
        parts.append(query)
        
        response = self.model.generate_content(parts)
        return response.text

    async def generate_response_stream(self, query: str, file_ids: List[str]):
        """Streaming response generator"""
        parts = []
        for file_name in file_ids:
             try:
                 file_obj = genai.get_file(file_name)
                 parts.append(file_obj)
             except Exception as e:
                 print(f"Error fetching file {file_name}: {e}")
        
        parts.append(query)
        
        response = self.model.generate_content(parts, stream=True)
        for chunk in response:
            yield chunk.text

