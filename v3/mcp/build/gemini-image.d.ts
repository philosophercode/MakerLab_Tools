/**
 * Gemini image generation for MCP server.
 * Portable version of v3/app/src/lib/gemini-image.ts.
 */
export interface GeminiImageResult {
    imageBase64: string;
    mimeType: string;
    text?: string;
    model: string;
}
export declare function generateImage(prompt: string): Promise<GeminiImageResult>;
