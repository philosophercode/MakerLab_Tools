import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock "server-only" before importing
vi.mock("server-only", () => ({}));

// Mock unpdf module
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// We need to re-import the module for each test because of caching state.
// The fetchDocContent function caches results. We'll use unique URLs per test.
import { fetchDocContent } from "@/lib/doc-fetcher";

function textResponse(body: string, contentType = "text/plain", status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchDocContent", () => {
  it("fetches and returns plain text content", async () => {
    const url = "https://example.com/readme-" + Math.random() + ".txt";
    mockFetch.mockResolvedValueOnce(textResponse("Hello, world!", "text/plain"));

    const result = await fetchDocContent(url);
    expect(result).toBe("Hello, world!");
  });

  it("strips HTML tags from HTML content", async () => {
    const url = "https://example.com/page-" + Math.random() + ".html";
    mockFetch.mockResolvedValueOnce(
      textResponse(
        "<html><body><h1>Title</h1><p>Content here</p></body></html>",
        "text/html"
      )
    );

    const result = await fetchDocContent(url);
    expect(result).toContain("Title");
    expect(result).toContain("Content here");
    expect(result).not.toContain("<h1>");
    expect(result).not.toContain("<p>");
  });

  it("strips script and style tags from HTML", async () => {
    const url = "https://example.com/script-" + Math.random() + ".html";
    mockFetch.mockResolvedValueOnce(
      textResponse(
        '<html><script>alert("xss")</script><style>.red{color:red}</style><body>Safe</body></html>',
        "text/html"
      )
    );

    const result = await fetchDocContent(url);
    expect(result).toContain("Safe");
    expect(result).not.toContain("alert");
    expect(result).not.toContain(".red");
  });

  it("skips YouTube URLs and returns null", async () => {
    const result1 = await fetchDocContent(
      "https://www.youtube.com/watch?v=test" + Math.random()
    );
    expect(result1).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips youtu.be short URLs", async () => {
    const result = await fetchDocContent(
      "https://youtu.be/abc" + Math.random()
    );
    expect(result).toBeNull();
  });

  it("returns null for failed fetches", async () => {
    const url = "https://example.com/fail-" + Math.random();
    mockFetch.mockResolvedValueOnce(new Response("", { status: 500 }));

    const result = await fetchDocContent(url);
    expect(result).toBeNull();
  });

  it("returns null for fetch errors (network failure)", async () => {
    const url = "https://example.com/neterr-" + Math.random();
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchDocContent(url);
    expect(result).toBeNull();
  });

  it("caches results and returns cached value on second call", async () => {
    const url = "https://example.com/cached-" + Math.random();
    mockFetch.mockResolvedValueOnce(textResponse("cached content", "text/plain"));

    const first = await fetchDocContent(url);
    const second = await fetchDocContent(url);

    expect(first).toBe("cached content");
    expect(second).toBe("cached content");
    // fetch should only be called once due to caching
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("truncates content to MAX_TEXT_LENGTH (30,000 chars)", async () => {
    const url = "https://example.com/long-" + Math.random();
    const longText = "x".repeat(50_000);
    mockFetch.mockResolvedValueOnce(textResponse(longText, "text/plain"));

    const result = await fetchDocContent(url);
    expect(result).toHaveLength(30_000);
  });

  it("handles Google Docs URLs via export endpoint", async () => {
    const url =
      "https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit";
    mockFetch.mockResolvedValueOnce(textResponse("Google doc content"));

    const result = await fetchDocContent(url);
    expect(result).toBe("Google doc content");

    const fetchedUrl = mockFetch.mock.calls[0][0] as string;
    expect(fetchedUrl).toContain("export?format=txt");
    expect(fetchedUrl).toContain("1aBcDeFgHiJkLmNoPqRsTuVwXyZ");
  });

  it("detects PDF by content-type when URL doesn't end in .pdf", async () => {
    const url = "https://example.com/doc-" + Math.random() + "/view";
    const { getDocumentProxy, extractText } = await import("unpdf");

    const mockProxy = {};
    (getDocumentProxy as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockProxy
    );
    (extractText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: ["Page 1 content", "Page 2 content"],
    });

    mockFetch.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );

    const result = await fetchDocContent(url);
    expect(result).toContain("[Page 1]");
    expect(result).toContain("Page 1 content");
    expect(result).toContain("[Page 2]");
    expect(result).toContain("Page 2 content");
  });

  it("returns null for non-Google-Docs URL with no extractable content type", async () => {
    const url = "https://example.com/binary-" + Math.random();
    mockFetch.mockResolvedValueOnce(
      new Response("binary", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      })
    );

    const result = await fetchDocContent(url);
    expect(result).toBeNull();
  });
});
