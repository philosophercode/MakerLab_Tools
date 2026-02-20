import "server-only";

const MAX_TEXT_LENGTH = 30_000; // ~30k chars ≈ ~8k tokens

// ── Type detection ──────────────────────────────────────────────────

function extractGoogleDocId(url: string): string | null {
  const match = url.match(
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/
  );
  return match ? match[1] : null;
}

function isPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

// ── Fetchers ────────────────────────────────────────────────────────

async function fetchGoogleDocText(url: string): Promise<string | null> {
  const docId = extractGoogleDocId(url);
  if (!docId) return null;

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const res = await fetch(exportUrl, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return await res.text();
}

async function fetchPdfText(url: string): Promise<string | null> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;

  const buffer = new Uint8Array(await res.arrayBuffer());
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function fetchWebPageText(url: string): Promise<string | null> {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;

  const contentType = res.headers.get("content-type") || "";

  // Response is actually a PDF
  if (contentType.includes("application/pdf")) {
    const buffer = new Uint8Array(await res.arrayBuffer());
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(buffer);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  if (contentType.includes("text/plain")) {
    return await res.text();
  }

  if (contentType.includes("text/html")) {
    const html = await res.text();
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return null;
}

// ── Main entry point ────────────────────────────────────────────────

/**
 * Fetch text content from a document URL.
 * Supports: Google Docs, PDFs, HTML pages, plain text.
 * YouTube URLs are skipped (transcript APIs are unreliable).
 * Returns null if the URL isn't accessible or content can't be extracted.
 */
export async function fetchDocContent(url: string): Promise<string | null> {
  try {
    // Skip YouTube — transcript APIs are currently broken
    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      return null;
    }

    let text: string | null = null;

    if (extractGoogleDocId(url)) {
      text = await fetchGoogleDocText(url);
    } else if (isPdfUrl(url)) {
      text = await fetchPdfText(url);
    } else {
      text = await fetchWebPageText(url);
    }

    if (!text) return null;
    return text.slice(0, MAX_TEXT_LENGTH);
  } catch {
    return null;
  }
}
