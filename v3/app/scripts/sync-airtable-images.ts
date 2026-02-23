import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const API_URL = "https://api.airtable.com/v0";
const TOOLS_TABLE_ID = "tblXHIT0mN2nOzdhd";
const DEFAULT_MAX_PIXELS = 2_000_000;

type AirtableRecord = {
  id: string;
  fields: {
    name?: string;
    image_attachments?: Array<{
      url?: string;
      thumbnails?: {
        full?: { url?: string };
        large?: { url?: string };
      };
    }>;
  };
};

function parseArgs(argv: string[]) {
  const args = {
    maxPixels: DEFAULT_MAX_PIXELS,
    outputDir: resolve(process.cwd(), "public", "tool-images"),
    limit: 0,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--max-pixels=")) {
      args.maxPixels = Number(arg.split("=")[1] || DEFAULT_MAX_PIXELS);
    } else if (arg.startsWith("--output-dir=")) {
      args.outputDir = resolve(process.cwd(), arg.split("=")[1] || args.outputDir);
    } else if (arg.startsWith("--limit=")) {
      args.limit = Number(arg.split("=")[1] || 0);
    }
  }

  return args;
}

function loadEnvFromFile(content: string) {
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function loadLocalEnv() {
  const candidates = [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), ".env")];
  for (const file of candidates) {
    try {
      loadEnvFromFile(await readFile(file, "utf8"));
    } catch {
      // ignore missing file
    }
  }
}

function safeToolName(name: string): string {
  return name.replaceAll("/", "_").replace(/\s+/g, " ").trim();
}

function pickAttachmentUrl(record: AirtableRecord): string | null {
  const first = record.fields.image_attachments?.[0];
  if (!first) return null;
  return first.url || first.thumbnails?.full?.url || first.thumbnails?.large?.url || null;
}

async function fetchAllTools(baseId: string, apiKey: string): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset: string | undefined;

  while (true) {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const url = `${API_URL}/${baseId}/${TOOLS_TABLE_ID}?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Airtable fetch failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { records?: AirtableRecord[]; offset?: string };
    records.push(...(data.records || []));
    if (!data.offset) break;
    offset = data.offset;
  }

  return records;
}

async function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolvePromise(stdout);
      reject(new Error(`${cmd} ${args.join(" ")} failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function getImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
  const out = await runCommand("sips", ["-g", "pixelWidth", "-g", "pixelHeight", filePath]);
  const widthMatch = out.match(/pixelWidth:\s+(\d+)/);
  const heightMatch = out.match(/pixelHeight:\s+(\d+)/);
  if (!widthMatch || !heightMatch) {
    throw new Error(`Could not parse dimensions for ${basename(filePath)}`);
  }
  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

function targetLongestSide(width: number, height: number, maxPixels: number): number {
  const pixels = width * height;
  if (pixels <= maxPixels) return Math.max(width, height);
  const scale = Math.sqrt(maxPixels / pixels);
  return Math.max(1, Math.floor(Math.max(width, height) * scale));
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function writeIfChanged(destPath: string, data: Buffer): Promise<boolean> {
  try {
    const existing = await readFile(destPath);
    if (sha256(existing) === sha256(data)) return false;
  } catch {
    // new file
  }
  await writeFile(destPath, data);
  return true;
}

async function processOne(
  name: string,
  imageUrl: string,
  maxPixels: number,
  outputDir: string,
  tempDir: string
): Promise<"written" | "unchanged"> {
  const safe = safeToolName(name);
  const tempInput = join(tempDir, `${safe}.source`);
  const tempOutput = join(tempDir, `${safe}.png`);
  const finalOutput = join(outputDir, `${safe}.png`);

  const res = await fetch(imageUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  await writeFile(tempInput, Buffer.from(arrayBuffer));

  const { width, height } = await getImageDimensions(tempInput);
  const longest = targetLongestSide(width, height, maxPixels);

  await runCommand("sips", ["-s", "format", "png", "-Z", String(longest), tempInput, "--out", tempOutput]);
  const pngBytes = await readFile(tempOutput);
  const changed = await writeIfChanged(finalOutput, pngBytes);
  return changed ? "written" : "unchanged";
}

async function ensureDir(pathToCreate: string) {
  await runCommand("mkdir", ["-p", pathToCreate]);
}

async function main() {
  const { maxPixels, outputDir, limit } = parseArgs(process.argv);
  await loadLocalEnv();

  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    throw new Error("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID");
  }

  await ensureDir(outputDir);
  const tempDir = await mkdtemp(join(tmpdir(), "makerlab-img-sync-"));

  let written = 0;
  let unchanged = 0;
  let skipped = 0;
  let errors = 0;

  try {
    let tools = await fetchAllTools(baseId, apiKey);
    if (limit > 0) tools = tools.slice(0, limit);

    for (const rec of tools) {
      const name = rec.fields.name?.trim();
      const imageUrl = pickAttachmentUrl(rec);
      if (!name || !imageUrl) {
        skipped += 1;
        continue;
      }

      try {
        const result = await processOne(name, imageUrl, maxPixels, outputDir, tempDir);
        if (result === "written") written += 1;
        else unchanged += 1;
      } catch (err) {
        errors += 1;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`ERROR ${name}: ${msg}`);
      }
    }
  } finally {
    try {
      const tempStat = await stat(tempDir);
      if (tempStat.isDirectory()) {
        await rm(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  }

  console.log(
    `sync-airtable-images complete: written=${written} unchanged=${unchanged} skipped=${skipped} errors=${errors}`
  );
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
