/**
 * Chat agent for MCP server.
 *
 * Wraps the Anthropic Claude API with tool-calling to provide the same
 * conversational experience as the /api/chat route — tool lookup, doc
 * fetching, unit details, maintenance reporting, image generation, and
 * follow-up suggestions — all accessible via a single MCP tool call.
 */
export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}
export interface ChatResult {
    response: string;
    suggestions: string[];
    images: Array<{
        base64: string;
        mimeType: string;
        caption?: string;
    }>;
}
export declare function chat(params: {
    message: string;
    history?: ChatMessage[];
    tool_id?: string;
}): Promise<ChatResult>;
