/**
 * Portable document content fetcher for MCP server.
 * Adapted from v3/app/src/lib/doc-fetcher.ts — no Next.js dependencies.
 *
 * Supports: Google Docs, PDFs, HTML pages, plain text.
 * YouTube URLs are skipped (transcript APIs are unreliable).
 */
/**
 * Fetch text content from a document URL.
 * Supports: Google Docs, PDFs, HTML pages, plain text.
 * YouTube URLs are skipped.
 */
export declare function fetchDocContent(url: string): Promise<string | null>;
