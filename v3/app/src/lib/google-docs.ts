import "server-only";

/**
 * Extract a Google Doc ID from a URL.
 * Handles formats like:
 *   https://docs.google.com/document/d/DOC_ID/edit
 *   https://docs.google.com/document/d/DOC_ID/
 */
function extractDocId(url: string): string | null {
  const match = url.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/
  );
  return match ? match[1] : null;
}

/**
 * Fetch the plain text content of a Google Doc.
 * Returns null if the URL isn't a Google Doc or the doc isn't publicly accessible.
 */
export async function fetchGoogleDocText(url: string): Promise<string | null> {
  const docId = extractDocId(url);
  if (!docId) return null;

  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const res = await fetch(exportUrl, {
      next: { revalidate: 300 }, // Cache for ISR period
    });

    if (!res.ok) return null;

    const text = await res.text();
    // Trim to a reasonable size for the system prompt
    return text.slice(0, 8000);
  } catch {
    return null;
  }
}
