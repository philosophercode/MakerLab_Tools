/**
 * Portable AirTable client for MCP server.
 * Adapted from v3/app/src/lib/airtable.ts — no Next.js dependencies.
 */
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
        small: {
            url: string;
            width: number;
            height: number;
        };
        large: {
            url: string;
            width: number;
            height: number;
        };
        full?: {
            url: string;
            width: number;
            height: number;
        };
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
export declare function listTools(filters?: {
    category?: string;
    location?: string;
}): Promise<ResolvedTool[]>;
export declare function getTool(nameOrId: string): Promise<ResolvedTool | null>;
export declare function searchTools(query: string): Promise<ResolvedTool[]>;
export declare function listUnits(toolName?: string): Promise<Array<{
    id: string;
    unit_label: string;
    tool_name: string;
    status: string;
    condition: string;
}>>;
export declare function getUnit(labelOrId: string): Promise<{
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
} | null>;
export declare function listMaintenanceLogs(filters?: {
    status?: string;
    priority?: string;
}): Promise<Array<{
    id: string;
    title: string;
    unit_label: string;
    type: string;
    priority: string;
    status: string;
    date_reported: string;
    description: string;
}>>;
export declare function createMaintenanceLog(fields: {
    title: string;
    unit_label: string;
    type?: string;
    priority?: string;
    reported_by?: string;
    description?: string;
}): Promise<{
    id: string;
    title: string;
}>;
export interface ToolImageInfo {
    id: string;
    name: string;
    description: string;
    image_url: string | null;
    image_filename: string | null;
}
export declare function getToolsWithImages(): Promise<ToolImageInfo[]>;
