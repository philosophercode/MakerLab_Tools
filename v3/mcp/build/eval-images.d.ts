/**
 * Image evaluation via Claude vision API.
 * Port of v3/scripts/eval_images.py to TypeScript.
 */
import type { ToolImageInfo } from "./airtable.js";
export interface EvalResult {
    name: string;
    status: "PASS" | "FAIL" | "WARN" | "SKIP" | "ERROR";
    image_filename: string | null;
    eval?: {
        match: boolean;
        confidence: string;
        image_shows: string;
        reasoning: string;
    };
    reason?: string;
    filename_issue?: string;
}
export declare function evaluateImage(tool: ToolImageInfo): Promise<EvalResult>;
export declare function evaluateAllImages(tools: ToolImageInfo[], onProgress?: (current: number, total: number, result: EvalResult) => void): Promise<{
    results: EvalResult[];
    summary: {
        pass: number;
        fail: number;
        warn: number;
        skip: number;
        error: number;
    };
}>;
