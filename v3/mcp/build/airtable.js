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
};
// ── Client ─────────────────────────────────────────────────────────
function getConfig() {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const apiKey = process.env.AIRTABLE_API_KEY;
    if (!baseId || !apiKey) {
        throw new Error("Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY environment variables");
    }
    return { baseId, apiKey };
}
async function airtableFetch(path, options) {
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
async function fetchTable(tableId, params) {
    const records = [];
    let offset;
    do {
        const searchParams = new URLSearchParams();
        if (offset)
            searchParams.set("offset", offset);
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
        records.push(...data.records);
        offset = data.offset;
    } while (offset);
    return records;
}
async function fetchRecord(tableId, recordId) {
    const res = await airtableFetch(`/${tableId}/${recordId}`);
    return res.json();
}
async function createRecord(tableId, fields) {
    const res = await airtableFetch(`/${tableId}`, {
        method: "POST",
        body: JSON.stringify({ fields }),
    });
    return res.json();
}
// ── TTL cache ──────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000; // 60 seconds
function createCache(fetcher) {
    let entry = null;
    let inflight = null;
    return async () => {
        if (entry && Date.now() < entry.expiresAt)
            return entry.data;
        if (inflight)
            return inflight;
        inflight = fetcher().then((data) => {
            entry = { data, expiresAt: Date.now() + CACHE_TTL_MS };
            inflight = null;
            return data;
        });
        return inflight;
    };
}
// ── Public API ─────────────────────────────────────────────────────
const getCategories = createCache(() => fetchTable(TABLES.categories, {
    sort: [{ field: "group", direction: "asc" }],
}));
const getLocations = createCache(() => fetchTable(TABLES.locations, {
    sort: [{ field: "room", direction: "asc" }],
}));
const getAllToolsRaw = createCache(() => fetchTable(TABLES.tools, {
    sort: [{ field: "name", direction: "asc" }],
}));
const getAllUnitsRaw = createCache(() => fetchTable(TABLES.units, {
    sort: [{ field: "unit_label", direction: "asc" }],
}));
function resolveToolRecord(tool, catMap, locMap) {
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
        image_url: firstImage?.thumbnails?.large?.url || firstImage?.url || null,
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
async function getResolvedTools() {
    const [tools, { catMap, locMap }] = await Promise.all([
        getAllToolsRaw(),
        buildLookupMaps(),
    ]);
    return tools.map((t) => resolveToolRecord(t, catMap, locMap));
}
/** Build a Map from tool record ID → tool name (from cache). */
async function getToolNameMap() {
    const tools = await getAllToolsRaw();
    return new Map(tools.map((t) => [t.id, t.fields.name]));
}
export async function listTools(filters) {
    let resolved = await getResolvedTools();
    if (filters?.category) {
        const cat = filters.category.toLowerCase();
        resolved = resolved.filter((t) => t.category_group.toLowerCase().includes(cat) ||
            t.category_sub.toLowerCase().includes(cat));
    }
    if (filters?.location) {
        const loc = filters.location.toLowerCase();
        resolved = resolved.filter((t) => t.location_room.toLowerCase().includes(loc) ||
            t.location_zone.toLowerCase().includes(loc));
    }
    return resolved;
}
export async function getTool(nameOrId) {
    const resolved = await getResolvedTools();
    if (nameOrId.startsWith("rec")) {
        const match = resolved.find((t) => t.id === nameOrId);
        if (match)
            return match;
    }
    // Search by name (case-insensitive)
    return (resolved.find((t) => t.name.toLowerCase() === nameOrId.toLowerCase()) || null);
}
export async function searchTools(query) {
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
export async function listUnits(toolName) {
    const [units, toolNameMap] = await Promise.all([
        getAllUnitsRaw(),
        getToolNameMap(),
    ]);
    let filtered = units;
    if (toolName) {
        // Find matching tool ID from cache
        const toolEntry = [...toolNameMap.entries()].find(([, name]) => name.toLowerCase() === toolName.toLowerCase());
        if (!toolEntry)
            return [];
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
export async function getUnit(labelOrId) {
    const units = await getAllUnitsRaw();
    let unit;
    if (labelOrId.startsWith("rec")) {
        unit = units.find((u) => u.id === labelOrId);
    }
    if (!unit) {
        const q = labelOrId.toLowerCase();
        unit = units.find((u) => u.fields.unit_label.toLowerCase() === q);
    }
    if (!unit)
        return null;
    // Resolve parent tool from cache
    let parentTool = null;
    const toolId = unit.fields.tool?.[0];
    if (toolId) {
        const resolved = await getResolvedTools();
        parentTool = resolved.find((t) => t.id === toolId) || null;
    }
    // Maintenance logs must be fetched fresh (not cached — they change)
    const logs = await fetchTable(TABLES.maintenance_logs, {
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
export async function listMaintenanceLogs(filters) {
    const [logs, units] = await Promise.all([
        fetchTable(TABLES.maintenance_logs, {
            sort: [{ field: "date_reported", direction: "desc" }],
        }),
        getAllUnitsRaw(),
    ]);
    const unitMap = new Map(units.map((u) => [u.id, u.fields.unit_label]));
    let filtered = logs;
    if (filters?.status) {
        const s = filters.status.toLowerCase();
        filtered = filtered.filter((l) => (l.fields.status || "").toLowerCase() === s);
    }
    if (filters?.priority) {
        const p = filters.priority.toLowerCase();
        filtered = filtered.filter((l) => (l.fields.priority || "").toLowerCase() === p);
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
export async function createMaintenanceLog(fields) {
    // Resolve unit by label from cache
    const units = await getAllUnitsRaw();
    const q = fields.unit_label.toLowerCase();
    const unit = units.find((u) => u.fields.unit_label.toLowerCase() === q);
    if (!unit) {
        throw new Error(`Unit not found: ${fields.unit_label}`);
    }
    const record = await createRecord(TABLES.maintenance_logs, {
        title: fields.title,
        unit: [unit.id],
        type: fields.type,
        priority: fields.priority,
        status: "Open",
        reported_by: fields.reported_by,
        description: fields.description,
        date_reported: new Date().toISOString().split("T")[0],
    });
    return { id: record.id, title: record.fields.title };
}
export async function getToolsWithImages() {
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
