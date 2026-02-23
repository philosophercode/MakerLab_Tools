#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const API_URL = "https://api.airtable.com/v0";
const TABLES = [
  { key: "tools", tableId: "tblXHIT0mN2nOzdhd", filename: "tools.json" },
  { key: "categories", tableId: "tblNpVHquh7H0S8Bc", filename: "categories.json" },
  { key: "locations", tableId: "tblbwtZhuvtuBKlPO", filename: "locations.json" },
  { key: "units", tableId: "tblDtKMcCxTyQbXwi", filename: "units.json" },
];

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data", "airtable");
const STATE_FILE = path.join(DATA_DIR, "sync-state.json");

function parseArgs(argv) {
  const args = {
    cmd: argv[2] || "status",
    dryRun: false,
    startup: false,
    conflict: "fail",
  };

  for (const arg of argv.slice(3)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--startup") args.startup = true;
    else if (arg.startsWith("--conflict=")) {
      const mode = arg.split("=")[1];
      if (["fail", "git-wins", "airtable-wins"].includes(mode)) {
        args.conflict = mode;
      }
    }
  }
  return args;
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function readJson(filePath, fallback = null) {
  if (!(await fileExists(filePath))) return fallback;
  return JSON.parse(await readText(filePath));
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function parseEnvContent(content) {
  const out = {};
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
    out[key] = value;
  }
  return out;
}

async function loadLocalEnv() {
  const envFiles = [".env.local", ".env"];
  for (const rel of envFiles) {
    const full = path.join(ROOT, rel);
    if (!(await fileExists(full))) continue;
    const parsed = parseEnvContent(await readText(full));
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = stableValue(value[key]);
    }
    return sorted;
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value), null, 2) + "\n";
}

function hashFields(fields) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableValue(fields)))
    .digest("hex");
}

async function writeJsonIfChanged(filePath, value) {
  const next = stableStringify(value);
  if (await fileExists(filePath)) {
    const prev = await readText(filePath);
    if (prev === next) return false;
  }
  await fs.writeFile(filePath, next, "utf8");
  return true;
}

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

async function airtableFetch(baseId, apiKey, requestPath, options = {}, retries = 2) {
  const url = `${API_URL}/${baseId}${requestPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get("Retry-After") || "2");
    await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    return airtableFetch(baseId, apiKey, requestPath, options, retries - 1);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${requestPath}: ${body}`);
  }
  return res.json();
}

async function fetchTableRecords(baseId, apiKey, tableId) {
  const all = [];
  let offset = null;
  do {
    const q = new URLSearchParams();
    if (offset) q.set("offset", offset);
    const data = await airtableFetch(
      baseId,
      apiKey,
      `/${tableId}${q.toString() ? `?${q.toString()}` : ""}`
    );
    const records = (data.records || []).map((r) => ({
      id: r.id,
      createdTime: r.createdTime || null,
      fields: r.fields || {},
    }));
    all.push(...records);
    offset = data.offset || null;
  } while (offset);

  all.sort((a, b) => a.id.localeCompare(b.id));
  return all;
}

async function runPull(baseId, apiKey, { startup }) {
  await ensureDir(DATA_DIR);
  const state = await readJson(STATE_FILE, {
    schemaVersion: 1,
    tables: {},
  });

  const writes = [];
  for (const t of TABLES) {
    const records = await fetchTableRecords(baseId, apiKey, t.tableId);
    const payload = {
      schemaVersion: 1,
      table: t.key,
      tableId: t.tableId,
      baseId,
      recordCount: records.length,
      records,
    };
    const changed = await writeJsonIfChanged(path.join(DATA_DIR, t.filename), payload);
    writes.push({ table: t.key, changed, count: records.length });

    state.tables[t.key] = {
      tableId: t.tableId,
      recordHashes: Object.fromEntries(records.map((r) => [r.id, hashFields(r.fields)])),
    };
  }

  const stateChanged = await writeJsonIfChanged(STATE_FILE, state);
  for (const w of writes) {
    const suffix = w.changed ? "updated" : "unchanged";
    console.log(`pull:${w.table} ${w.count} records (${suffix})`);
  }
  console.log(`pull:sync-state ${stateChanged ? "updated" : "unchanged"}`);

  if (startup) {
    console.log("startup sync complete");
  }
}

async function pushBatch(baseId, apiKey, tableId, method, records, dryRun) {
  if (records.length === 0) return 0;
  if (dryRun) return records.length;

  const chunks = chunk(records, 10);
  let total = 0;
  for (const c of chunks) {
    const body = { records: c, typecast: true };
    await airtableFetch(baseId, apiKey, `/${tableId}`, {
      method,
      body: JSON.stringify(body),
    });
    total += c.length;
  }
  return total;
}

async function runPush(baseId, apiKey, { dryRun, conflict }) {
  const state = await readJson(STATE_FILE, { schemaVersion: 1, tables: {} });
  let conflictCount = 0;

  for (const t of TABLES) {
    const snapshotPath = path.join(DATA_DIR, t.filename);
    const snapshot = await readJson(snapshotPath, null);
    if (!snapshot) {
      console.log(`push:${t.key} skipped (missing ${t.filename})`);
      continue;
    }

    const remote = await fetchTableRecords(baseId, apiKey, t.tableId);
    const remoteMap = new Map(remote.map((r) => [r.id, r]));
    const baseHashes = state.tables?.[t.key]?.recordHashes || {};

    const toUpdate = [];
    const toCreate = [];
    let skipped = 0;

    for (const local of snapshot.records || []) {
      const localFields = local.fields || {};
      const localHash = hashFields(localFields);
      const localId = local.id || null;

      if (localId && remoteMap.has(localId)) {
        const remoteRec = remoteMap.get(localId);
        const remoteHash = hashFields(remoteRec.fields || {});
        const baseHash = baseHashes[localId] || null;

        if (localHash === remoteHash) {
          skipped += 1;
          continue;
        }

        const bothChanged = baseHash && baseHash !== remoteHash && baseHash !== localHash;
        if (bothChanged && conflict === "fail") {
          console.error(`conflict:${t.key}:${localId} local and Airtable changed since last pull`);
          conflictCount += 1;
          continue;
        }
        if (bothChanged && conflict === "airtable-wins") {
          skipped += 1;
          continue;
        }
        toUpdate.push({ id: localId, fields: localFields });
        continue;
      }

      if (localId && !remoteMap.has(localId)) {
        console.error(`missing-remote:${t.key}:${localId} not found in Airtable; skipping`);
        skipped += 1;
        continue;
      }

      toCreate.push({ fields: localFields });
    }

    if (conflictCount > 0 && conflict === "fail") {
      continue;
    }

    const updated = await pushBatch(baseId, apiKey, t.tableId, "PATCH", toUpdate, dryRun);
    const created = await pushBatch(baseId, apiKey, t.tableId, "POST", toCreate, dryRun);
    console.log(
      `push:${t.key} update=${updated} create=${created} skipped=${skipped}${dryRun ? " (dry-run)" : ""}`
    );
  }

  if (conflictCount > 0 && conflict === "fail") {
    throw new Error(`push aborted with ${conflictCount} conflicts (use --conflict=git-wins or airtable-wins)`);
  }
}

async function runStatus() {
  await ensureDir(DATA_DIR);
  const state = await readJson(STATE_FILE, { schemaVersion: 1, tables: {} });
  for (const t of TABLES) {
    const snapshot = await readJson(path.join(DATA_DIR, t.filename), null);
    if (!snapshot) {
      console.log(`status:${t.key} missing`);
      continue;
    }
    const hashCount = Object.keys(state.tables?.[t.key]?.recordHashes || {}).length;
    console.log(`status:${t.key} records=${snapshot.recordCount || 0} stateHashes=${hashCount}`);
  }
}

async function main(args) {
  await loadLocalEnv();

  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  const hasCreds = Boolean(baseId && apiKey);

  if (args.cmd === "status") {
    await runStatus();
    return;
  }

  if (!hasCreds) {
    if (args.startup) {
      console.log("startup sync skipped: AIRTABLE_BASE_ID or AIRTABLE_API_KEY missing");
      return;
    }
    throw new Error("AIRTABLE_BASE_ID and AIRTABLE_API_KEY are required");
  }

  if (args.cmd === "pull") {
    await runPull(baseId, apiKey, { startup: args.startup });
    return;
  }
  if (args.cmd === "push") {
    await runPush(baseId, apiKey, { dryRun: args.dryRun, conflict: args.conflict });
    return;
  }
  throw new Error(`Unknown command: ${args.cmd}`);
}

const args = parseArgs(process.argv);
main(args).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (args.startup) {
    console.warn(`startup sync skipped after error: ${message}`);
    process.exit(0);
  }
  console.error(`sync error: ${message}`);
  process.exit(1);
});
