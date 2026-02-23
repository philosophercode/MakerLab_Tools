/**
 * Image evaluation via Claude vision API.
 * Port of v3/scripts/eval_images.py to TypeScript.
 */
import Anthropic from "@anthropic-ai/sdk";
const EVAL_PROMPT = `You are evaluating whether a product image matches a tool listing.

Tool name: {name}
Tool description: {description}

Look at the image and determine:
1. Does the image show the tool described above?
2. Is the image a reasonable product photo for this listing?

Respond with EXACTLY this JSON format (no markdown, no extra text):
{
  "match": true or false,
  "confidence": "high" or "medium" or "low",
  "image_shows": "brief description of what the image actually shows",
  "reasoning": "one sentence explaining your verdict"
}`;
function getAnthropicClient() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("Missing ANTHROPIC_API_KEY environment variable");
    }
    return new Anthropic({ apiKey });
}
async function downloadImage(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Image download failed: ${res.status}`);
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();
    return {
        base64: Buffer.from(buffer).toString("base64"),
        mediaType: contentType,
    };
}
function parseEvalResponse(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
        const lines = cleaned.split("\n");
        cleaned = lines.filter((l) => !l.trim().startsWith("```")).join("\n");
    }
    try {
        return JSON.parse(cleaned);
    }
    catch {
        return null;
    }
}
export async function evaluateImage(tool) {
    if (!tool.image_url) {
        return {
            name: tool.name,
            status: "SKIP",
            image_filename: tool.image_filename,
            reason: "No image",
        };
    }
    let imgData;
    try {
        imgData = await downloadImage(tool.image_url);
    }
    catch (e) {
        return {
            name: tool.name,
            status: "ERROR",
            image_filename: tool.image_filename,
            reason: `Download failed: ${e}`,
        };
    }
    const client = getAnthropicClient();
    const prompt = EVAL_PROMPT.replace("{name}", tool.name).replace("{description}", tool.description);
    try {
        const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 300,
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: imgData.mediaType,
                                data: imgData.base64,
                            },
                        },
                        { type: "text", text: prompt },
                    ],
                },
            ],
        });
        const text = response.content[0].type === "text" ? response.content[0].text : "";
        const parsed = parseEvalResponse(text);
        if (!parsed || parsed.match === undefined) {
            return {
                name: tool.name,
                status: "ERROR",
                image_filename: tool.image_filename,
                reason: "Could not parse Claude response",
            };
        }
        // Filename cross-check
        const normalize = (s) => s.toLowerCase().replace(/[/_]/g, "").replace(/\s+/g, " ").trim();
        const fnStem = tool.image_filename
            ? tool.image_filename.replace(/\.[^.]+$/, "")
            : "";
        const filenameMismatch = fnStem && normalize(fnStem) !== normalize(tool.name);
        if (!parsed.match) {
            return {
                name: tool.name,
                status: "FAIL",
                image_filename: tool.image_filename,
                eval: parsed,
            };
        }
        else if (filenameMismatch) {
            return {
                name: tool.name,
                status: "WARN",
                image_filename: tool.image_filename,
                eval: parsed,
                filename_issue: `expected ~'${tool.name}', got '${tool.image_filename}'`,
            };
        }
        else {
            return {
                name: tool.name,
                status: "PASS",
                image_filename: tool.image_filename,
                eval: parsed,
            };
        }
    }
    catch (e) {
        return {
            name: tool.name,
            status: "ERROR",
            image_filename: tool.image_filename,
            reason: `Claude API error: ${e}`,
        };
    }
}
export async function evaluateAllImages(tools, onProgress) {
    const results = [];
    const summary = { pass: 0, fail: 0, warn: 0, skip: 0, error: 0 };
    for (let i = 0; i < tools.length; i++) {
        const result = await evaluateImage(tools[i]);
        results.push(result);
        switch (result.status) {
            case "PASS":
                summary.pass++;
                break;
            case "FAIL":
                summary.fail++;
                break;
            case "WARN":
                summary.warn++;
                break;
            case "SKIP":
                summary.skip++;
                break;
            case "ERROR":
                summary.error++;
                break;
        }
        onProgress?.(i + 1, tools.length, result);
        // Rate limit
        if (result.status !== "SKIP") {
            await new Promise((r) => setTimeout(r, 500));
        }
    }
    return { results, summary };
}
