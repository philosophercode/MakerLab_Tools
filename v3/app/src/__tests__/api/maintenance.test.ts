import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock "server-only"
vi.mock("server-only", () => ({}));

// Mock dependencies
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("@/lib/airtable", () => ({
  createMaintenanceLog: vi.fn(),
  uploadAttachment: vi.fn(),
}));

import { POST } from "@/app/api/maintenance/route";
import { rateLimit } from "@/lib/rate-limit";
import { createMaintenanceLog, uploadAttachment } from "@/lib/airtable";

const mockRateLimit = vi.mocked(rateLimit);
const mockCreateLog = vi.mocked(createMaintenanceLog);
const mockUpload = vi.mocked(uploadAttachment);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/maintenance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({ allowed: true, remaining: 4 });
});

describe("POST /api/maintenance", () => {
  it("creates a maintenance log with minimal fields", async () => {
    mockCreateLog.mockResolvedValueOnce({
      id: "recNEW1",
      createdTime: "2024-01-01",
      fields: { title: "Nozzle clogged" },
    });

    const res = await POST(
      makeRequest({ title: "Nozzle clogged" })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, id: "recNEW1" });
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Nozzle clogged",
        type: "Issue Report",
        priority: "Medium",
        status: "Open",
      })
    );
  });

  it("creates a log with all fields", async () => {
    mockCreateLog.mockResolvedValueOnce({
      id: "recFULL",
      createdTime: "2024-01-01",
      fields: { title: "Belt loose" },
    });

    const res = await POST(
      makeRequest({
        title: "Belt loose",
        unit_id: "recABCDEFGHIJKLMN",
        type: "Repair",
        priority: "High",
        description: "The X-axis belt is slipping.",
        reported_by: "jd123",
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockCreateLog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Belt loose",
        type: "Repair",
        priority: "High",
        description: "The X-axis belt is slipping.",
        reported_by: "jd123",
        unit: ["recABCDEFGHIJKLMN"],
      })
    );
  });

  it("uploads photos after creating the record", async () => {
    mockCreateLog.mockResolvedValueOnce({
      id: "recWITHPHOTO",
      createdTime: "2024-01-01",
      fields: { title: "Cracked bed" },
    });
    mockUpload.mockResolvedValue(undefined);

    const photos = [
      { contentType: "image/jpeg", filename: "photo1.jpg", base64: "abc=" },
      { contentType: "image/png", filename: "photo2.png", base64: "def=" },
    ];

    const res = await POST(
      makeRequest({ title: "Cracked bed", photos })
    );

    expect(res.status).toBe(200);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockUpload).toHaveBeenCalledWith(
      "recWITHPHOTO",
      "photo_attachments",
      photos[0]
    );
    expect(mockUpload).toHaveBeenCalledWith(
      "recWITHPHOTO",
      "photo_attachments",
      photos[1]
    );
  });

  // ── Rate limiting ──────────────────────────────────────────────────

  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0 });

    const res = await POST(makeRequest({ title: "test" }));

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Too many requests");
  });

  // ── Validation errors ──────────────────────────────────────────────

  it("returns 400 for missing title", async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 400 for title exceeding max length", async () => {
    const res = await POST(makeRequest({ title: "x".repeat(201) }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 400 for invalid unit_id format", async () => {
    const res = await POST(
      makeRequest({ title: "test", unit_id: "not-a-valid-id" })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Invalid unit ID");
  });

  it("returns 400 for invalid image content type", async () => {
    const res = await POST(
      makeRequest({
        title: "test",
        photos: [
          { contentType: "image/gif", filename: "a.gif", base64: "x" },
        ],
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("JPEG, PNG, WebP, and HEIC");
  });

  it("returns 400 for too many photos", async () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({
      contentType: "image/jpeg",
      filename: `photo${i}.jpg`,
      base64: "x",
    }));

    const res = await POST(makeRequest({ title: "test", photos }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Maximum 5 photos");
  });

  it("returns 400 for invalid type enum value", async () => {
    const res = await POST(
      makeRequest({ title: "test", type: "Destruction" })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("returns 400 for invalid priority enum value", async () => {
    const res = await POST(
      makeRequest({ title: "test", priority: "Extreme" })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  // ── Server errors ─────────────────────────────────────────────────

  it("returns 500 when createMaintenanceLog throws", async () => {
    mockCreateLog.mockRejectedValueOnce(new Error("AirTable API 500"));

    const res = await POST(makeRequest({ title: "test" }));

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("AirTable API 500");
  });

  it("includes date_reported in the created record", async () => {
    mockCreateLog.mockResolvedValueOnce({
      id: "recDATE",
      createdTime: "2024-01-01",
      fields: { title: "test" },
    });

    await POST(makeRequest({ title: "test" }));

    const call = mockCreateLog.mock.calls[0][0];
    expect(call.date_reported).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
