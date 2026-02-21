import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mockStreamText is available inside hoisted vi.mock factories
const { mockStreamText } = vi.hoisted(() => ({
  mockStreamText: vi.fn(),
}));

// Mock "server-only"
vi.mock("server-only", () => ({}));

// Mock rate-limit
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
  getClientIp: vi.fn(() => "127.0.0.1"),
}));

// Mock airtable
vi.mock("@/lib/airtable", () => ({
  fetchTool: vi.fn(),
  fetchAllTools: vi.fn(),
  fetchAllCategories: vi.fn(),
  fetchAllLocations: vi.fn(),
  fetchAllUnits: vi.fn(),
  resolveTools: vi.fn(),
  createMaintenanceLog: vi.fn(),
}));

// Mock doc-fetcher
vi.mock("@/lib/doc-fetcher", () => ({
  fetchDocContent: vi.fn(() => Promise.resolve(null)),
}));

// Mock AI SDK
vi.mock("ai", () => ({
  streamText: mockStreamText,
  convertToModelMessages: vi.fn(async (msgs: unknown[]) => msgs),
  stepCountIs: vi.fn((n: number) => n),
  tool: vi.fn((config: unknown) => config),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: Object.assign(vi.fn(() => "mock-model"), {
    tools: {
      webSearch_20250305: vi.fn(() => "mock-web-search"),
    },
  }),
}));

import { POST } from "@/app/api/chat/route";
import { rateLimit } from "@/lib/rate-limit";
import {
  fetchTool,
  fetchAllTools,
  fetchAllCategories,
  fetchAllLocations,
  resolveTools,
} from "@/lib/airtable";

const mockRateLimit = vi.mocked(rateLimit);
const mockFetchTool = vi.mocked(fetchTool);
const mockFetchAllTools = vi.mocked(fetchAllTools);
const mockFetchAllCategories = vi.mocked(fetchAllCategories);
const mockFetchAllLocations = vi.mocked(fetchAllLocations);
const mockResolveTools = vi.mocked(resolveTools);

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeResolved = [
  {
    id: "recT1",
    name: "Prusa MK4S",
    description: "FDM 3D Printer",
    category_group: "Digital Fabrication",
    category_sub: "3D Printers",
    location_room: "Design Lab",
    location_zone: "Zone A",
    materials: ["PLA"],
    ppe_required: [] as string[],
    tags: [] as string[],
    authorized_only: false,
    training_required: false,
    use_restrictions: null,
    emergency_stop: null,
    safety_doc_url: null,
    sop_url: null,
    video_url: null,
    map_tag: null,
    image_url: null,
    image_attachments: [] as never[],
    manual_attachments: [] as never[],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockReturnValue({ allowed: true, remaining: 19 });

  mockFetchAllTools.mockResolvedValue([]);
  mockFetchAllCategories.mockResolvedValue([]);
  mockFetchAllLocations.mockResolvedValue([]);
  mockResolveTools.mockReturnValue(fakeResolved);

  // Make streamText return a mock stream response
  mockStreamText.mockReturnValue({
    toUIMessageStreamResponse: () =>
      new Response("data: stream", { status: 200 }),
  });
});

describe("POST /api/chat", () => {
  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0 });

    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "hi" }] })
    );

    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toContain("Too many requests");
  });

  it("handles general chat (no toolId)", async () => {
    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "What tools do you have?" }],
      })
    );

    expect(res.status).toBe(200);
    expect(mockFetchAllTools).toHaveBeenCalledOnce();
    expect(mockFetchAllCategories).toHaveBeenCalledOnce();
    expect(mockFetchAllLocations).toHaveBeenCalledOnce();
    expect(mockResolveTools).toHaveBeenCalledOnce();
    expect(mockStreamText).toHaveBeenCalledOnce();
  });

  it("passes system prompt to streamText for general chat", async () => {
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
      })
    );

    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.system).toContain("Cornell MakerLab");
    expect(callArgs.system).toContain("Prusa MK4S");
  });

  it("handles tool-specific chat with toolId", async () => {
    const toolRecord = {
      id: "recT1",
      createdTime: "2024-01-01",
      fields: {
        name: "Prusa MK4S",
        description: "FDM",
        category: ["recC1"],
        location: ["recL1"],
      },
    };
    mockFetchTool.mockResolvedValueOnce(toolRecord as any);
    mockResolveTools.mockReturnValueOnce(fakeResolved);

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "How do I level the bed?" }],
        toolId: "recT1",
      })
    );

    expect(res.status).toBe(200);
    expect(mockFetchTool).toHaveBeenCalledWith("recT1");
    // In tool-specific mode, fetchAllTools should NOT be called
    expect(mockFetchAllTools).not.toHaveBeenCalled();
  });

  it("includes tool details in system prompt for tool-specific chat", async () => {
    const toolRecord = {
      id: "recT1",
      createdTime: "2024-01-01",
      fields: { name: "Prusa MK4S", category: ["recC1"], location: ["recL1"] },
    };
    mockFetchTool.mockResolvedValueOnce(toolRecord as any);

    const resolved = [
      {
        ...fakeResolved[0],
        name: "Prusa MK4S",
        training_required: true,
        ppe_required: ["Safety Glasses"],
      },
    ];
    mockResolveTools.mockReturnValueOnce(resolved);

    await POST(
      makeRequest({
        messages: [{ role: "user", content: "Is training required?" }],
        toolId: "recT1",
      })
    );

    const callArgs = mockStreamText.mock.calls[0][0];
    expect(callArgs.system).toContain("Prusa MK4S");
    expect(callArgs.system).toContain("Training Required");
    expect(callArgs.system).toContain("Safety Glasses");
  });

  it("includes get_tool_details tool only in general chat", async () => {
    // General chat
    await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
      })
    );

    const generalTools = mockStreamText.mock.calls[0][0].tools;
    expect(generalTools.get_tool_details).toBeDefined();
    expect(generalTools.report_issue).toBeDefined();
    expect(generalTools.web_search).toBeDefined();

    // Tool-specific chat
    vi.clearAllMocks();
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 19 });

    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: () =>
        new Response("data: stream", { status: 200 }),
    });

    mockFetchTool.mockResolvedValueOnce({
      id: "recT1",
      createdTime: "2024-01-01",
      fields: { name: "Prusa", category: ["recC1"], location: ["recL1"] },
    } as any);
    mockFetchAllCategories.mockResolvedValue([]);
    mockFetchAllLocations.mockResolvedValue([]);
    mockResolveTools.mockReturnValueOnce(fakeResolved);

    await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
        toolId: "recT1",
      })
    );

    const toolSpecificTools = mockStreamText.mock.calls[0][0].tools;
    expect(toolSpecificTools.get_tool_details).toBeUndefined();
    expect(toolSpecificTools.report_issue).toBeDefined();
  });

  it("returns 500 on unexpected errors", async () => {
    mockFetchAllTools.mockRejectedValueOnce(new Error("DB connection failed"));

    const res = await POST(
      makeRequest({
        messages: [{ role: "user", content: "hello" }],
      })
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain("DB connection failed");
  });

  it("sets maxDuration export to 60", async () => {
    const mod = await import("@/app/api/chat/route");
    expect(mod.maxDuration).toBe(60);
  });
});
