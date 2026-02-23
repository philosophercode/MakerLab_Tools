import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { spawn } from "child_process";
import path from "path";
import fs from "fs/promises";

const SCRIPTS_DIR = path.resolve(process.cwd(), "..", "scripts");
const PUBLIC_IMAGES_DIR = path.resolve(process.cwd(), "public", "tool-images");
const NOBG_DIR = path.join(SCRIPTS_DIR, "tool_images_nobg");
const GENERATED_DIR = path.join(SCRIPTS_DIR, "tool_images_generated");

/**
 * GET /api/image?toolName=xxx&since=timestamp
 * Polls whether the image has been updated since a given timestamp.
 */
export async function GET(req: NextRequest) {
  const toolName = req.nextUrl.searchParams.get("toolName");
  const since = Number(req.nextUrl.searchParams.get("since") || "0");

  if (!toolName) {
    return NextResponse.json({ error: "toolName required" }, { status: 400 });
  }

  const safeName = toolName.replace(/\//g, "_");
  const imagePath = path.join(PUBLIC_IMAGES_DIR, `${safeName}.png`);

  try {
    const stat = await fs.stat(imagePath);
    const modifiedAt = stat.mtimeMs;
    const done = modifiedAt > since;
    return NextResponse.json({ done, modifiedAt });
  } catch {
    return NextResponse.json({ done: false, modifiedAt: 0 });
  }
}

/**
 * POST /api/image
 * Kicks off image regeneration or background removal as a detached
 * background process. Returns immediately — client polls GET for completion.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { allowed } = rateLimit(`image:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  let body: { toolName: string; action: string; sourceUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { toolName, action, sourceUrl } = body;

  if (!toolName || typeof toolName !== "string") {
    return NextResponse.json({ error: "toolName required" }, { status: 400 });
  }

  if (!["regenerate", "remove-bg", "replace-from-url"].includes(action)) {
    return NextResponse.json(
      { error: "action must be 'regenerate', 'remove-bg', or 'replace-from-url'" },
      { status: 400 }
    );
  }

  const safeName = toolName.replace(/\//g, "_");
  const outputPath = path.join(PUBLIC_IMAGES_DIR, `${safeName}.png`);

  // Build a shell command that runs the script and copies the result
  // to all target directories. Runs detached so it survives page refresh.
  let command: string;

  if (action === "regenerate") {
    const escapedName = toolName.replace(/'/g, "'\\''");
    command = [
      `cd '${SCRIPTS_DIR}'`,
      `python3 generate_images.py --tool '${escapedName}'`,
      `cp '${path.join(GENERATED_DIR, `${safeName}.png`)}' '${outputPath}'`,
      `cp '${path.join(GENERATED_DIR, `${safeName}.png`)}' '${path.join(NOBG_DIR, `${safeName}.png`)}'`,
    ].join(" && ");
  } else if (action === "remove-bg") {
    const escapedName = toolName.replace(/'/g, "'\\''");
    command = [
      `cd '${SCRIPTS_DIR}'`,
      `python3 remove_backgrounds.py --tool '${escapedName}' --local`,
      `cp '${path.join(NOBG_DIR, `${safeName}.png`)}' '${outputPath}'`,
    ].join(" && ");
  } else {
    if (!sourceUrl || typeof sourceUrl !== "string") {
      return NextResponse.json(
        { error: "sourceUrl required for replace-from-url" },
        { status: 400 }
      );
    }
    const escapedName = toolName.replace(/'/g, "'\\''");
    const escapedUrl = sourceUrl.replace(/'/g, "'\\''");
    command = [
      `cd '${SCRIPTS_DIR}'`,
      `python3 replace_from_url.py --tool '${escapedName}' --url '${escapedUrl}'`,
      `cp '${path.join(NOBG_DIR, `${safeName}.png`)}' '${outputPath}'`,
    ].join(" && ");
  }

  // Spawn detached — the process continues even if the HTTP connection drops
  const child = spawn("sh", ["-c", command], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  return NextResponse.json({
    success: true,
    started: true,
    action,
    message: `${action} started in background — poll GET /api/image for completion`,
  });
}
