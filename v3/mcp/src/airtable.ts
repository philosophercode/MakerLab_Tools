/**
 * Portable AirTable client for MCP server.
 * Adapted from v3/app/src/lib/airtable.ts — no Next.js dependencies.
 */

const API_URL = "https://api.airtable.com/v0";

const TABLES = {
  tools: "tblXHIT0mN2nOzdhd",
  categories: "tblNpVHquh7H0S8Bc",
  locations: "tblbwtZhuvtuBKlPO",
  units: "tblDtKMcCxTyQbXwi",
  maintenance_logs: "tbl22sgbMLCFbvynl",
} as const;

// ── Types ──────────────────────────────────────────────────────────

export interface AirtableRecord<T> {
  id: string;
  createdTime: string;
  fields: T;
}

export interface Attachment {
  id: string;
  url: string;
  filename: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
  thumbnails?: {
    small: { url: string; width: number; height: number };
    large: { url: string; width: number; height: number };
    full?: { url: string; width: number; height: number };
  };
}

export interface ToolFields {
  name: string;
  description?: string;
  category?: string[];
  location?: string[];
  materials?: string[];
  ppe_required?: string[];
  tags?: string[];
  authorized_only?: boolean;
  training_required?: boolean;
  use_restrictions?: string;
  emergency_stop?: string;
  safety_doc_url?: string;
  sop_url?: string;
  video_url?: string;
  map_tag?: string;
  image_attachments?: Attachment[];
  manual_attachments?: Attachment[];
}

export interface CategoryFields {
  name: string;
  group: string;
}

export interface LocationFields {
  name: string;
  room: string;
}

export interface UnitFields {
  unit_label: string;
  tool?: string[];
  serial_number?: string;
  asset_tag?: string;
  status?: string;
  condition?: string;
  date_acquired?: string;
  notes?: string;
  qr_code_id?: string;
}

export interface MaintenanceLogFields {
  title: string;
  unit?: string[];
  type?: string;
  priority?: string;
  status?: string;
  reported_by?: string;
  assigned_to?: string;
  description?: string;
  resolution?: string;
  date_reported?: string;
  date_resolved?: string;
  photo_attachments?: Attachment[];
}

// ── Resolved tool with category/location names ─────────────────────

export interface ResolvedTool {
  id: string;
  name: string;
  description: string;
  category_group: string;
  category_sub: string;
  location_room: string;
  location_zone: string;
  materials: string[];
  ppe_required: string[];
  tags: string[];
  authorized_only: boolean;
  training_required: boolean;
  has_image: boolean;
  image_url: string | null;
  sop_url: string | null;
  safety_doc_url: string | null;
  video_url: string | null;
}

// ── Client ─────────────────────────────────────────────────────────

function getConfig() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) {
    throw new Error(
      "Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY environment variables"
    );
  }
  return { baseId, apiKey };
}

async function airtableFetch(path: string, options?: RequestInit): Promise<Response> {
  const { baseId, apiKey } = getConfig();
  const url = `${API_URL}/${baseId}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

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

async function fetchTable<T>(
  tableId: string,
  params?: {
    filterByFormula?: string;
    sort?: { field: string; direction?: "asc" | "desc" }[];
  }
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

async function fetchRecord<T>(
  tableId: string,
  recordId: string
): Promise<AirtableRecord<T>> {
  const res = await airtableFetch(`/${tableId}/${recordId}`);
  return res.json();
}

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

// ── TTL cache ──────────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function createCache<T>(fetcher: () => Promise<T>) {
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null;

  return async (): Promise<T> => {
    if (entry && Date.now() < entry.expiresAt) return entry.data;
    if (inflight) return inflight;

    inflight = fetcher().then((data) => {
      entry = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      inflight = null;
      return data;
    });
    return inflight;
  };
}

// ── Public API ─────────────────────────────────────────────────────

const getCategories = createCache(() =>
  fetchTable<CategoryFields>(TABLES.categories, {
    sort: [{ field: "group", direction: "asc" }],
  })
);

const getLocations = createCache(() =>
  fetchTable<LocationFields>(TABLES.locations, {
    sort: [{ field: "room", direction: "asc" }],
  })
);

const getAllToolsRaw = createCache(() =>
  fetchTable<ToolFields>(TABLES.tools, {
    sort: [{ field: "name", direction: "asc" }],
  })
);

const getAllUnitsRaw = createCache(() =>
  fetchTable<UnitFields>(TABLES.units, {
    sort: [{ field: "unit_label", direction: "asc" }],
  })
);

function resolveToolRecord(
  tool: AirtableRecord<ToolFields>,
  catMap: Map<string, CategoryFields>,
  locMap: Map<string, LocationFields>
): ResolvedTool {
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
    has_image: !!firstImage,
    image_url:
      firstImage?.thumbnails?.large?.url || firstImage?.url || null,
    sop_url: tool.fields.sop_url || null,
    safety_doc_url: tool.fields.safety_doc_url || null,
    video_url: tool.fields.video_url || null,
  };
}

async function buildLookupMaps() {
  const categories = await getCategories();
  const locations = await getLocations();
  const catMap = new Map(categories.map((c) => [c.id, c.fields]));
  const locMap = new Map(locations.map((l) => [l.id, l.fields]));
  return { catMap, locMap };
}

/** Resolve all tools with category/location names (cached). */
async function getResolvedTools(): Promise<ResolvedTool[]> {
  const [tools, { catMap, locMap }] = await Promise.all([
    getAllToolsRaw(),
    buildLookupMaps(),
  ]);
  return tools.map((t) => resolveToolRecord(t, catMap, locMap));
}

/** Build a Map from tool record ID → tool name (from cache). */
async function getToolNameMap(): Promise<Map<string, string>> {
  const tools = await getAllToolsRaw();
  return new Map(tools.map((t) => [t.id, t.fields.name]));
}

export async function listTools(filters?: {
  category?: string;
  location?: string;
}): Promise<ResolvedTool[]> {
  let resolved = await getResolvedTools();

  if (filters?.category) {
    const cat = filters.category.toLowerCase();
    resolved = resolved.filter(
      (t) =>
        t.category_group.toLowerCase().includes(cat) ||
        t.category_sub.toLowerCase().includes(cat)
    );
  }
  if (filters?.location) {
    const loc = filters.location.toLowerCase();
    resolved = resolved.filter(
      (t) =>
        t.location_room.toLowerCase().includes(loc) ||
        t.location_zone.toLowerCase().includes(loc)
    );
  }

  return resolved;
}

export async function getTool(
  nameOrId: string
): Promise<ResolvedTool | null> {
  const resolved = await getResolvedTools();

  if (nameOrId.startsWith("rec")) {
    const match = resolved.find((t) => t.id === nameOrId);
    if (match) return match;
  }

  // Search by name (case-insensitive)
  return (
    resolved.find(
      (t) => t.name.toLowerCase() === nameOrId.toLowerCase()
    ) || null
  );
}

export async function searchTools(query: string): Promise<ResolvedTool[]> {
  const q = query.toLowerCase();
  const resolved = await getResolvedTools();

  return resolved.filter((t) => {
    const searchable = [
      t.name,
      t.description,
      ...t.materials,
      ...t.tags,
    ]
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
}

export async function listUnits(toolName?: string): Promise<
  Array<{
    id: string;
    unit_label: string;
    tool_name: string;
    status: string;
    condition: string;
  }>
> {
  const [units, toolNameMap] = await Promise.all([
    getAllUnitsRaw(),
    getToolNameMap(),
  ]);

  let filtered = units;
  if (toolName) {
    // Find matching tool ID from cache
    const toolEntry = [...toolNameMap.entries()].find(
      ([, name]) => name.toLowerCase() === toolName.toLowerCase()
    );
    if (!toolEntry) return [];
    const toolId = toolEntry[0];
    filtered = units.filter((u) => u.fields.tool?.includes(toolId));
  }

  return filtered.map((u) => ({
    id: u.id,
    unit_label: u.fields.unit_label,
    tool_name: toolNameMap.get(u.fields.tool?.[0] || "") || "Unknown",
    status: u.fields.status || "Unknown",
    condition: u.fields.condition || "Unknown",
  }));
}

export async function getUnit(labelOrId: string): Promise<{
  id: string;
  unit_label: string;
  tool_name: string;
  serial_number: string;
  asset_tag: string;
  status: string;
  condition: string;
  date_acquired: string;
  notes: string;
  sop_url: string | null;
  safety_doc_url: string | null;
  video_url: string | null;
  training_required: boolean;
  authorized_only: boolean;
  maintenance_logs: Array<{
    id: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    date_reported: string;
    description: string;
  }>;
} | null> {
  const units = await getAllUnitsRaw();

  let unit: AirtableRecord<UnitFields> | undefined;
  if (labelOrId.startsWith("rec")) {
    unit = units.find((u) => u.id === labelOrId);
  }
  if (!unit) {
    const q = labelOrId.toLowerCase();
    unit = units.find((u) => u.fields.unit_label.toLowerCase() === q);
  }
  if (!unit) return null;

  // Resolve parent tool from cache
  let parentTool: ResolvedTool | null = null;
  const toolId = unit.fields.tool?.[0];
  if (toolId) {
    const resolved = await getResolvedTools();
    parentTool = resolved.find((t) => t.id === toolId) || null;
  }

  // Maintenance logs must be fetched fresh (not cached — they change)
  const logs = await fetchTable<MaintenanceLogFields>(TABLES.maintenance_logs, {
    filterByFormula: `FIND("${unit.id}", ARRAYJOIN(RECORD_ID(unit)))`,
    sort: [{ field: "date_reported", direction: "desc" }],
  });

  return {
    id: unit.id,
    unit_label: unit.fields.unit_label,
    tool_name: parentTool?.name || "Unknown",
    serial_number: unit.fields.serial_number || "",
    asset_tag: unit.fields.asset_tag || "",
    status: unit.fields.status || "Unknown",
    condition: unit.fields.condition || "Unknown",
    date_acquired: unit.fields.date_acquired || "",
    notes: unit.fields.notes || "",
    sop_url: parentTool?.sop_url ?? null,
    safety_doc_url: parentTool?.safety_doc_url ?? null,
    video_url: parentTool?.video_url ?? null,
    training_required: parentTool?.training_required ?? false,
    authorized_only: parentTool?.authorized_only ?? false,
    maintenance_logs: logs.map((l) => ({
      id: l.id,
      title: l.fields.title,
      type: l.fields.type || "",
      priority: l.fields.priority || "",
      status: l.fields.status || "",
      date_reported: l.fields.date_reported || "",
      description: l.fields.description || "",
    })),
  };
}

export async function listMaintenanceLogs(filters?: {
  status?: string;
  priority?: string;
}): Promise<
  Array<{
    id: string;
    title: string;
    unit_label: string;
    type: string;
    priority: string;
    status: string;
    date_reported: string;
    description: string;
  }>
> {
  const [logs, units] = await Promise.all([
    fetchTable<MaintenanceLogFields>(TABLES.maintenance_logs, {
      sort: [{ field: "date_reported", direction: "desc" }],
    }),
    getAllUnitsRaw(),
  ]);

  const unitMap = new Map(units.map((u) => [u.id, u.fields.unit_label]));

  let filtered = logs;
  if (filters?.status) {
    const s = filters.status.toLowerCase();
    filtered = filtered.filter(
      (l) => (l.fields.status || "").toLowerCase() === s
    );
  }
  if (filters?.priority) {
    const p = filters.priority.toLowerCase();
    filtered = filtered.filter(
      (l) => (l.fields.priority || "").toLowerCase() === p
    );
  }

  return filtered.map((l) => ({
    id: l.id,
    title: l.fields.title,
    unit_label: unitMap.get(l.fields.unit?.[0] || "") || "Unknown",
    type: l.fields.type || "",
    priority: l.fields.priority || "",
    status: l.fields.status || "",
    date_reported: l.fields.date_reported || "",
    description: l.fields.description || "",
  }));
}

export async function createMaintenanceLog(fields: {
  title: string;
  unit_label: string;
  type?: string;
  priority?: string;
  reported_by?: string;
  description?: string;
}): Promise<{ id: string; title: string }> {
  // Resolve unit by label from cache
  const units = await getAllUnitsRaw();
  const q = fields.unit_label.toLowerCase();
  const unit = units.find((u) => u.fields.unit_label.toLowerCase() === q);
  if (!unit) {
    throw new Error(`Unit not found: ${fields.unit_label}`);
  }

  const record = await createRecord<MaintenanceLogFields>(
    TABLES.maintenance_logs,
    {
      title: fields.title,
      unit: [unit.id],
      type: fields.type as MaintenanceLogFields["type"],
      priority: fields.priority as MaintenanceLogFields["priority"],
      status: "Open",
      reported_by: fields.reported_by,
      description: fields.description,
      date_reported: new Date().toISOString().split("T")[0],
    }
  );

  return { id: record.id, title: record.fields.title };
}

// ── For image evaluation ───────────────────────────────────────────

export interface ToolImageInfo {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  image_filename: string | null;
}

export async function getToolsWithImages(): Promise<ToolImageInfo[]> {
  const tools = await getAllToolsRaw();

  return tools.map((t) => {
    const img = t.fields.image_attachments?.[0];
    const thumb = img?.thumbnails?.large;
    return {
      id: t.id,
      name: t.fields.name,
      description: t.fields.description || "",
      image_url: thumb?.url || img?.url || null,
      image_filename: img?.filename || null,
    };
  });
}
