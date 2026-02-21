import "server-only";
import type {
  AirtableRecord,
  ToolFields,
  ToolRecord,
  ToolWithMeta,
  CategoryFields,
  CategoryRecord,
  LocationFields,
  LocationRecord,
  UnitFields,
  UnitRecord,
  MaintenanceLogFields,
  MaintenanceLogRecord,
} from "./types";

const API_URL = "https://api.airtable.com/v0";
const CONTENT_URL = "https://content.airtable.com/v0";
const BASE_ID = process.env.AIRTABLE_BASE_ID!;
const API_KEY = process.env.AIRTABLE_API_KEY!;

// Table IDs from CLAUDE.md
const TABLES = {
  tools: "tblXHIT0mN2nOzdhd",
  categories: "tblNpVHquh7H0S8Bc",
  locations: "tblbwtZhuvtuBKlPO",
  units: "tblDtKMcCxTyQbXwi",
  maintenance_logs: "tbl22sgbMLCFbvynl",
} as const;

// ── Core fetch helper ───────────────────────────────────────────────

async function airtableFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${API_URL}/${BASE_ID}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  // Retry once on 429 rate limit
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
    await new Promise((r) => setTimeout(r, delay));
    return airtableFetch(path, options);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AirTable API ${res.status}: ${body}`);
  }

  return res;
}

// ── Generic paginated fetch ─────────────────────────────────────────

async function fetchTable<T>(
  tableId: string,
  params?: { filterByFormula?: string; sort?: { field: string; direction?: "asc" | "desc" }[] }
): Promise<AirtableRecord<T>[]> {
  const records: AirtableRecord<T>[] = [];
  let offset: string | undefined;

  do {
    const searchParams = new URLSearchParams();
    if (offset) searchParams.set("offset", offset);
    if (params?.filterByFormula)
      searchParams.set("filterByFormula", params.filterByFormula);
    if (params?.sort) {
      params.sort.forEach((s, i) => {
        searchParams.set(`sort[${i}][field]`, s.field);
        searchParams.set(`sort[${i}][direction]`, s.direction || "asc");
      });
    }

    const query = searchParams.toString();
    const path = `/${tableId}${query ? `?${query}` : ""}`;
    const res = await airtableFetch(path);
    const data = await res.json();

    records.push(...(data.records as AirtableRecord<T>[]));
    offset = data.offset;
  } while (offset);

  return records;
}

// ── Fetch single record ─────────────────────────────────────────────

async function fetchRecord<T>(
  tableId: string,
  recordId: string
): Promise<AirtableRecord<T>> {
  const res = await airtableFetch(`/${tableId}/${recordId}`);
  return res.json();
}

// ── Create record ───────────────────────────────────────────────────

async function createRecord<T>(
  tableId: string,
  fields: Partial<T>
): Promise<AirtableRecord<T>> {
  const res = await airtableFetch(`/${tableId}`, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  return res.json();
}

// ── Public API ──────────────────────────────────────────────────────

export async function fetchAllTools(): Promise<ToolRecord[]> {
  return fetchTable<ToolFields>(TABLES.tools, {
    sort: [{ field: "name", direction: "asc" }],
  });
}

export async function fetchTool(id: string): Promise<ToolRecord> {
  return fetchRecord<ToolFields>(TABLES.tools, id);
}

export async function fetchAllCategories(): Promise<CategoryRecord[]> {
  return fetchTable<CategoryFields>(TABLES.categories, {
    sort: [{ field: "group", direction: "asc" }],
  });
}

export async function fetchAllLocations(): Promise<LocationRecord[]> {
  return fetchTable<LocationFields>(TABLES.locations, {
    sort: [{ field: "room", direction: "asc" }],
  });
}

export async function fetchUnit(id: string): Promise<UnitRecord> {
  return fetchRecord<UnitFields>(TABLES.units, id);
}

export async function fetchUnitsByTool(
  toolRecordId: string
): Promise<UnitRecord[]> {
  return fetchTable<UnitFields>(TABLES.units, {
    filterByFormula: `FIND("${toolRecordId}", ARRAYJOIN(RECORD_ID(tool)))`,
  });
}

export async function fetchAllUnits(): Promise<UnitRecord[]> {
  return fetchTable<UnitFields>(TABLES.units, {
    sort: [{ field: "unit_label", direction: "asc" }],
  });
}

export async function fetchUnitByQrCode(
  qrCodeId: string
): Promise<UnitRecord | null> {
  const records = await fetchTable<UnitFields>(TABLES.units, {
    filterByFormula: `{qr_code_id} = "${qrCodeId}"`,
  });
  return records[0] || null;
}

export async function fetchMaintenanceLogsByUnit(
  unitRecordId: string
): Promise<MaintenanceLogRecord[]> {
  return fetchTable<MaintenanceLogFields>(TABLES.maintenance_logs, {
    filterByFormula: `FIND("${unitRecordId}", ARRAYJOIN(RECORD_ID(unit)))`,
    sort: [{ field: "date_reported", direction: "desc" }],
  });
}

export async function fetchMaintenanceLogsByTool(
  toolRecordId: string
): Promise<MaintenanceLogRecord[]> {
  // First get all units for this tool, then get logs for each
  const units = await fetchUnitsByTool(toolRecordId);
  if (units.length === 0) return [];

  const allLogs = await Promise.all(
    units.map((u) => fetchMaintenanceLogsByUnit(u.id).catch(() => [] as MaintenanceLogRecord[]))
  );
  // Flatten, then sort by date descending
  return allLogs
    .flat()
    .sort((a, b) => {
      const da = a.fields.date_reported || "";
      const db = b.fields.date_reported || "";
      return db.localeCompare(da);
    });
}

export async function createMaintenanceLog(
  fields: Partial<MaintenanceLogFields>
): Promise<MaintenanceLogRecord> {
  return createRecord<MaintenanceLogFields>(TABLES.maintenance_logs, fields);
}

// ── Upload attachment via content API ────────────────────────────────

export async function uploadAttachment(
  recordId: string,
  fieldName: string,
  file: { contentType: string; filename: string; base64: string },
  tableId: string = TABLES.maintenance_logs
): Promise<void> {
  const url = `${CONTENT_URL}/${BASE_ID}/${recordId}/${fieldName}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentType: file.contentType,
      filename: file.filename,
      file: file.base64,
    }),
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
    await new Promise((r) => setTimeout(r, delay));
    return uploadAttachment(recordId, fieldName, file, tableId);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AirTable Content API ${res.status}: ${body}`);
  }
}

// ── Resolve linked records ──────────────────────────────────────────

export function resolveTools(
  tools: ToolRecord[],
  categories: CategoryRecord[],
  locations: LocationRecord[]
): ToolWithMeta[] {
  const catMap = new Map(categories.map((c) => [c.id, c.fields]));
  const locMap = new Map(locations.map((l) => [l.id, l.fields]));

  return tools.map((tool) => {
    const catId = tool.fields.category?.[0];
    const locId = tool.fields.location?.[0];
    const cat = catId ? catMap.get(catId) : undefined;
    const loc = locId ? locMap.get(locId) : undefined;

    const firstImage = tool.fields.image_attachments?.[0];

    return {
      id: tool.id,
      name: tool.fields.name,
      description: tool.fields.description || "",
      category_group: cat?.group || "Uncategorized",
      category_sub: cat?.name || "Other",
      location_room: loc?.room || "Unknown",
      location_zone: loc?.name || "Unknown",
      materials: tool.fields.materials || [],
      ppe_required: tool.fields.ppe_required || [],
      tags: tool.fields.tags || [],
      authorized_only: tool.fields.authorized_only || false,
      training_required: tool.fields.training_required || false,
      use_restrictions: tool.fields.use_restrictions || null,
      emergency_stop: tool.fields.emergency_stop || null,
      safety_doc_url: tool.fields.safety_doc_url || null,
      sop_url: tool.fields.sop_url || null,
      video_url: tool.fields.video_url || null,
      map_tag: tool.fields.map_tag || null,
      image_url: firstImage?.thumbnails?.large?.url || firstImage?.url || null,
      image_attachments: tool.fields.image_attachments || [],
      manual_attachments: tool.fields.manual_attachments || [],
    };
  });
}
