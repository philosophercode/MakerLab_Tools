import { Tool } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function getTools(): Promise<Tool[]> {
  const res = await fetch(`${API_BASE_URL}/tools`);
  if (!res.ok) throw new Error('Failed to fetch tools');
  return res.json();
}

export async function getTool(id: string): Promise<Tool> {
  const res = await fetch(`${API_BASE_URL}/tools/${id}`);
  if (!res.ok) throw new Error('Failed to fetch tool');
  return res.json();
}

export async function sendChatMessage(query: string, toolId: string, onChunk: (chunk: string) => void) {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, tool_id: toolId }),
  });

  if (!res.ok) throw new Error('Failed to send message');
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    onChunk(chunk);
  }
}

