import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock "server-only" before importing the module
vi.mock("server-only", () => ({}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Set required env vars before import
vi.stubEnv("AIRTABLE_BASE_ID", "appTEST123");
vi.stubEnv("AIRTABLE_API_KEY", "patTEST456");

import {
  fetchAllTools,
  fetchTool,
  fetchAllCategories,
  fetchAllLocations,
  fetchUnit,
  fetchUnitsByTool,
  fetchAllUnits,
  fetchUnitByQrCode,
  fetchMaintenanceLogsByUnit,
  createMaintenanceLog,
  uploadAttachment,
  resolveTools,
} from "@/lib/airtable";

import type {
  ToolRecord,
  CategoryRecord,
  LocationRecord,
} from "@/lib/types";

// ── Helpers ──────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function makeToolRecord(overrides?: Partial<ToolRecord>): ToolRecord {
  return {
    id: "recTOOL1",
    createdTime: "2024-01-01T00:00:00.000Z",
    fields: {
      name: "Prusa MK4S",
      description: "FDM 3D Printer",
      category: ["recCAT1"],
      location: ["recLOC1"],
      materials: ["PLA", "PETG"],
      ppe_required: ["Safety Glasses"],
      tags: ["3d-printing"],
      authorized_only: false,
      training_required: true,
    },
    ...overrides,
  };
}

function makeCategoryRecord(overrides?: Partial<CategoryRecord>): CategoryRecord {
  return {
    id: "recCAT1",
    createdTime: "2024-01-01T00:00:00.000Z",
    fields: { name: "3D Printers", group: "Digital Fabrication" },
    ...overrides,
  };
}

function makeLocationRecord(overrides?: Partial<LocationRecord>): LocationRecord {
  return {
    id: "recLOC1",
    createdTime: "2024-01-01T00:00:00.000Z",
    fields: { name: "Zone A", room: "Design Lab" },
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchAllTools", () => {
  it("fetches tools sorted by name", async () => {
    const records = [makeToolRecord()];
    mockFetch.mockResolvedValueOnce(jsonResponse({ records, offset: undefined }));

    const result = await fetchAllTools();

    expect(result).toEqual(records);
    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("sort%5B0%5D%5Bfield%5D=name");
    expect(url).toContain("sort%5B0%5D%5Bdirection%5D=asc");
  });

  it("handles pagination via offset", async () => {
    const page1 = [makeToolRecord({ id: "recA" })];
    const page2 = [makeToolRecord({ id: "recB" })];

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ records: page1, offset: "page2token" }))
      .mockResolvedValueOnce(jsonResponse({ records: page2 }));

    const result = await fetchAllTools();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("recA");
    expect(result[1].id).toBe("recB");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call should include offset
    const url2 = mockFetch.mock.calls[1][0] as string;
    expect(url2).toContain("offset=page2token");
  });
});

describe("fetchTool", () => {
  it("fetches a single tool by ID", async () => {
    const record = makeToolRecord();
    mockFetch.mockResolvedValueOnce(jsonResponse(record));

    const result = await fetchTool("recTOOL1");
    expect(result).toEqual(record);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/tblXHIT0mN2nOzdhd/recTOOL1");
  });

  it("throws on API error", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );

    await expect(fetchTool("recBAD")).rejects.toThrow("AirTable API 404");
  });
});

describe("fetchAllCategories", () => {
  it("fetches categories sorted by group", async () => {
    const records = [makeCategoryRecord()];
    mockFetch.mockResolvedValueOnce(jsonResponse({ records }));

    const result = await fetchAllCategories();
    expect(result).toEqual(records);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("sort%5B0%5D%5Bfield%5D=group");
  });
});

describe("fetchAllLocations", () => {
  it("fetches locations sorted by room", async () => {
    const records = [makeLocationRecord()];
    mockFetch.mockResolvedValueOnce(jsonResponse({ records }));

    const result = await fetchAllLocations();
    expect(result).toEqual(records);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("sort%5B0%5D%5Bfield%5D=room");
  });
});

describe("fetchUnit", () => {
  it("fetches a unit by record ID", async () => {
    const record = {
      id: "recU1",
      createdTime: "2024-01-01T00:00:00.000Z",
      fields: { unit_label: "Prusa #1", status: "Available" },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(record));

    const result = await fetchUnit("recU1");
    expect(result.fields.unit_label).toBe("Prusa #1");
  });
});

describe("fetchUnitsByTool", () => {
  it("uses filterByFormula with tool record ID", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

    await fetchUnitsByTool("recTOOL1");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filterByFormula=");
    expect(url).toContain("recTOOL1");
  });
});

describe("fetchAllUnits", () => {
  it("fetches units sorted by unit_label", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

    await fetchAllUnits();

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("sort%5B0%5D%5Bfield%5D=unit_label");
  });
});

describe("fetchUnitByQrCode", () => {
  it("returns the first matching unit", async () => {
    const record = {
      id: "recU1",
      createdTime: "2024-01-01T00:00:00.000Z",
      fields: { unit_label: "Prusa #1", qr_code_id: "QR-001" },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [record] }));

    const result = await fetchUnitByQrCode("QR-001");
    expect(result?.id).toBe("recU1");
  });

  it("returns null when no unit matches", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

    const result = await fetchUnitByQrCode("QR-NOPE");
    expect(result).toBeNull();
  });
});

describe("fetchMaintenanceLogsByUnit", () => {
  it("filters by unit and sorts by date_reported desc", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ records: [] }));

    await fetchMaintenanceLogsByUnit("recU1");

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("filterByFormula=");
    expect(url).toContain("recU1");
    expect(url).toContain("sort%5B0%5D%5Bdirection%5D=desc");
  });
});

describe("createMaintenanceLog", () => {
  it("POSTs a new record and returns it", async () => {
    const created = {
      id: "recNEW",
      createdTime: "2024-06-01T00:00:00.000Z",
      fields: { title: "Broken nozzle", type: "Issue Report" },
    };
    mockFetch.mockResolvedValueOnce(jsonResponse(created));

    const result = await createMaintenanceLog({
      title: "Broken nozzle",
      type: "Issue Report",
    });

    expect(result.id).toBe("recNEW");
    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.fields.title).toBe("Broken nozzle");
  });
});

describe("uploadAttachment", () => {
  it("POSTs base64 file to the content API", async () => {
    mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

    await uploadAttachment("recLOG1", "photo_attachments", {
      contentType: "image/jpeg",
      filename: "photo.jpg",
      base64: "abc123==",
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("content.airtable.com");
    expect(url).toContain("recLOG1/photo_attachments/uploadAttachment");

    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.file).toBe("abc123==");
  });

  it("retries on 429 with Retry-After header", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "1" },
        })
      )
      .mockResolvedValueOnce(new Response("", { status: 200 }));

    const promise = uploadAttachment("recLOG1", "photos", {
      contentType: "image/png",
      filename: "a.png",
      base64: "x",
    });

    // Flush the setTimeout from the 429 retry
    await vi.advanceTimersByTimeAsync(1100);
    await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("throws on non-429 errors", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("Server Error", { status: 500 })
    );

    await expect(
      uploadAttachment("recLOG1", "photos", {
        contentType: "image/png",
        filename: "a.png",
        base64: "x",
      })
    ).rejects.toThrow("AirTable Content API 500");
  });
});

describe("rate limit retry in airtableFetch", () => {
  it("retries once on 429 from the API", async () => {
    vi.useFakeTimers();
    const record = makeToolRecord();

    mockFetch
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "1" },
        })
      )
      .mockResolvedValueOnce(jsonResponse(record));

    const promise = fetchTool("recTOOL1");
    await vi.advanceTimersByTimeAsync(1100);
    const result = await promise;

    expect(result).toEqual(record);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

// ── resolveTools (pure function, no mocks needed) ───────────────────

describe("resolveTools", () => {
  const tools: ToolRecord[] = [
    makeToolRecord({
      id: "recT1",
      fields: {
        name: "Laser Cutter",
        description: "A laser cutter",
        category: ["recCAT1"],
        location: ["recLOC1"],
        materials: ["Acrylic", "Wood"],
        ppe_required: ["Safety Glasses"],
        tags: ["laser"],
        authorized_only: true,
        training_required: true,
        use_restrictions: "No PVC",
        emergency_stop: "Red button on left",
        safety_doc_url: "https://example.com/safety.pdf",
        sop_url: "https://example.com/sop.pdf",
        video_url: "https://youtube.com/watch?v=123",
        map_tag: "LC1",
        image_attachments: [
          {
            id: "attIMG1",
            url: "https://example.com/img.jpg",
            filename: "img.jpg",
            size: 1000,
            type: "image/jpeg",
            thumbnails: {
              small: { url: "https://example.com/sm.jpg", width: 100, height: 100 },
              large: { url: "https://example.com/lg.jpg", width: 800, height: 800 },
            },
          },
        ],
        manual_attachments: [],
      },
    }),
  ];

  const categories: CategoryRecord[] = [
    makeCategoryRecord({ id: "recCAT1", fields: { name: "Laser Cutters", group: "CNC" } }),
  ];

  const locations: LocationRecord[] = [
    makeLocationRecord({ id: "recLOC1", fields: { name: "Bay 1", room: "Workshop" } }),
  ];

  it("resolves category and location from linked IDs", () => {
    const [resolved] = resolveTools(tools, categories, locations);

    expect(resolved.id).toBe("recT1");
    expect(resolved.name).toBe("Laser Cutter");
    expect(resolved.category_group).toBe("CNC");
    expect(resolved.category_sub).toBe("Laser Cutters");
    expect(resolved.location_room).toBe("Workshop");
    expect(resolved.location_zone).toBe("Bay 1");
  });

  it("uses the large thumbnail URL for image_url", () => {
    const [resolved] = resolveTools(tools, categories, locations);
    expect(resolved.image_url).toBe("https://example.com/lg.jpg");
  });

  it("uses fallback values when links are missing", () => {
    const toolNoLinks: ToolRecord[] = [
      {
        id: "recT2",
        createdTime: "2024-01-01T00:00:00.000Z",
        fields: {
          name: "Mystery Tool",
        },
      },
    ];

    const [resolved] = resolveTools(toolNoLinks, categories, locations);

    expect(resolved.category_group).toBe("Uncategorized");
    expect(resolved.category_sub).toBe("Other");
    expect(resolved.location_room).toBe("Unknown");
    expect(resolved.location_zone).toBe("Unknown");
    expect(resolved.materials).toEqual([]);
    expect(resolved.ppe_required).toEqual([]);
    expect(resolved.authorized_only).toBe(false);
    expect(resolved.training_required).toBe(false);
    expect(resolved.image_url).toBeNull();
    expect(resolved.safety_doc_url).toBeNull();
  });

  it("maps all ToolWithMeta fields correctly", () => {
    const [resolved] = resolveTools(tools, categories, locations);

    expect(resolved.materials).toEqual(["Acrylic", "Wood"]);
    expect(resolved.ppe_required).toEqual(["Safety Glasses"]);
    expect(resolved.tags).toEqual(["laser"]);
    expect(resolved.authorized_only).toBe(true);
    expect(resolved.training_required).toBe(true);
    expect(resolved.use_restrictions).toBe("No PVC");
    expect(resolved.emergency_stop).toBe("Red button on left");
    expect(resolved.sop_url).toBe("https://example.com/sop.pdf");
    expect(resolved.video_url).toBe("https://youtube.com/watch?v=123");
    expect(resolved.map_tag).toBe("LC1");
    expect(resolved.manual_attachments).toEqual([]);
  });

  it("handles multiple tools", () => {
    const multiTools: ToolRecord[] = [
      makeToolRecord({ id: "recA" }),
      makeToolRecord({ id: "recB" }),
      makeToolRecord({ id: "recC" }),
    ];

    const result = resolveTools(multiTools, categories, locations);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual(["recA", "recB", "recC"]);
  });
});
