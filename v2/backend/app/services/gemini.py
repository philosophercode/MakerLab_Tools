import google.generativeai as genai
import requests
import tempfile
import os
from app.config import settings
from typing import List, Generator, Optional

class GeminiService:
    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel('gemini-2.5-flash')

    def upload_file_from_url(self, url: str, filename: str) -> str:

        try:
            #Download file
            response = requests.get(url)
            response.raise_for_status()
            
            #Save to a temporary file
            extension = os.path.splitext(filename)[1]
            if not extension:
                extension = ".pdf" 
                
            with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name

            try:
                uploaded_file = genai.upload_file(path=temp_path)
                file_name = uploaded_file.name
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
            
            return file_name

        except Exception as e:
            print(f"Failed to process {filename}: {e}")
            raise e

    def generate_response_stream(
        self, 
        query: str, 
        file_ids: List[str], 
        system_instruction: Optional[str] = None
    ) -> Generator[str, None, None]:
        
        content_parts = []
        
        if system_instruction:
            content_parts.append(system_instruction)
            
        content_parts.append(f"User Question: {query}")

        for file_id in file_ids:
            content_parts.append(
                {"file_data": {"mime_type": "application/pdf", "file_uri": file_id}}
            )

        try:
            response_stream = self.model.generate_content(content_parts, stream=True)
            
            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            yield f"Error generating response: {str(e)}"

    def upload_file(self, file_path: str, mime_type: str = "application/pdf"):
        return genai.upload_file(file_path, mime_type=mime_type)