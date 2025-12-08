export interface Tool {
  id: string;
  name: string;
  description?: string;
  images: string[];
  manual_attachments: any[]; // refine based on Airtable response
  gemini_resource_ids?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

