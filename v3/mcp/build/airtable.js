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
// ── Public API ─────────────────────────────────────────────────────
let categoryCache = null;
let locationCache = null;
async function getCategories() {
    if (!categoryCache) {
        categoryCache = await fetchTable(TABLES.categories, {
            sort: [{ field: "group", direction: "asc" }],
        });
    }
    return categoryCache;
}
async function getLocations() {
    if (!locationCache) {
        locationCache = await fetchTable(TABLES.locations, {
            sort: [{ field: "room", direction: "asc" }],
        });
    }
    return locationCache;
}
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
export async function listTools(filters) {
    const tools = await fetchTable(TABLES.tools, {
        sort: [{ field: "name", direction: "asc" }],
    });
    const { catMap, locMap } = await buildLookupMaps();
    let resolved = tools.map((t) => resolveToolRecord(t, catMap, locMap));
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
    // Try fetching by record ID first
    if (nameOrId.startsWith("rec")) {
        try {
            const tool = await fetchRecord(TABLES.tools, nameOrId);
            const { catMap, locMap } = await buildLookupMaps();
            return resolveToolRecord(tool, catMap, locMap);
        }
        catch {
            // Fall through to name search
        }
    }
    // Search by name (case-insensitive)
    const tools = await fetchTable(TABLES.tools, {
        filterByFormula: `LOWER({name}) = LOWER("${nameOrId.replace(/"/g, '\\"')}")`,
    });
    if (tools.length === 0)
        return null;
    const { catMap, locMap } = await buildLookupMaps();
    return resolveToolRecord(tools[0], catMap, locMap);
}
export async function searchTools(query) {
    const q = query.toLowerCase();
    // AirTable doesn't support full-text search, so we fetch all and filter
    const tools = await fetchTable(TABLES.tools, {
        sort: [{ field: "name", direction: "asc" }],
    });
    const { catMap, locMap } = await buildLookupMaps();
    return tools
        .filter((t) => {
        const f = t.fields;
        const searchable = [
            f.name,
            f.description || "",
            ...(f.materials || []),
            ...(f.tags || []),
        ]
            .join(" ")
            .toLowerCase();
        return searchable.includes(q);
    })
        .map((t) => resolveToolRecord(t, catMap, locMap));
}
export async function listUnits(toolName) {
    let units;
    if (toolName) {
        // Find the tool record first
        const toolResult = await getTool(toolName);
        if (!toolResult)
            return [];
        units = await fetchTable(TABLES.units, {
            filterByFormula: `FIND("${toolResult.id}", ARRAYJOIN(RECORD_ID(tool)))`,
        });
    }
    else {
        units = await fetchTable(TABLES.units, {
            sort: [{ field: "unit_label", direction: "asc" }],
        });
    }
    // Resolve tool names for each unit
    const toolIds = new Set(units.flatMap((u) => u.fields.tool || []));
    const toolNames = new Map();
    for (const tid of toolIds) {
        try {
            const tool = await fetchRecord(TABLES.tools, tid);
            toolNames.set(tid, tool.fields.name);
        }
        catch {
            toolNames.set(tid, "Unknown");
        }
    }
    return units.map((u) => ({
        id: u.id,
        unit_label: u.fields.unit_label,
        tool_name: toolNames.get(u.fields.tool?.[0] || "") || "Unknown",
        status: u.fields.status || "Unknown",
        condition: u.fields.condition || "Unknown",
    }));
}
export async function getUnit(labelOrId) {
    let unit = null;
    // Try by record ID
    if (labelOrId.startsWith("rec")) {
        try {
            unit = await fetchRecord(TABLES.units, labelOrId);
        }
        catch {
            // Fall through
        }
    }
    // Try by label
    if (!unit) {
        const units = await fetchTable(TABLES.units, {
            filterByFormula: `LOWER({unit_label}) = LOWER("${labelOrId.replace(/"/g, '\\"')}")`,
        });
        unit = units[0] || null;
    }
    if (!unit)
        return null;
    // Resolve parent tool for name + SOP/safety/video URLs
    let toolName = "Unknown";
    let parentTool = null;
    const toolId = unit.fields.tool?.[0];
    if (toolId) {
        try {
            const toolRecord = await fetchRecord(TABLES.tools, toolId);
            const { catMap, locMap } = await buildLookupMaps();
            parentTool = resolveToolRecord(toolRecord, catMap, locMap);
            toolName = parentTool.name;
        }
        catch {
            // keep "Unknown"
        }
    }
    // Fetch maintenance logs
    const logs = await fetchTable(TABLES.maintenance_logs, {
        filterByFormula: `FIND("${unit.id}", ARRAYJOIN(RECORD_ID(unit)))`,
        sort: [{ field: "date_reported", direction: "desc" }],
    });
    return {
        id: unit.id,
        unit_label: unit.fields.unit_label,
        tool_name: toolName,
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
export async function createMaintenanceLog(fields) {
    // Resolve unit by label
    const units = await fetchTable(TABLES.units, {
        filterByFormula: `LOWER({unit_label}) = LOWER("${fields.unit_label.replace(/"/g, '\\"')}")`,
    });
    if (units.length === 0) {
        throw new Error(`Unit not found: ${fields.unit_label}`);
    }
    const record = await createRecord(TABLES.maintenance_logs, {
        title: fields.title,
        unit: [units[0].id],
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
    const tools = await fetchTable(TABLES.tools, {
        sort: [{ field: "name", direction: "asc" }],
    });
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
