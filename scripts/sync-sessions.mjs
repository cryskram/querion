#!/usr/bin/env node
/**
 * Bulk-sync pi sessions to Querion from the command line.
 *
 *   npm run sync:sessions                      # sync all sessions
 *   npm run sync:sessions -- morphix           # only paths containing "morphix"
 *   npm run sync:sessions -- <session-id>      # a specific session id
 *   npm run sync:sessions -- ~/x/session.jsonl # a specific file
 *   QUERION_URL=… QUERION_SYNC_TOKEN=… node scripts/sync-sessions.mjs
 *
 * Configuration resolves from (in order): process env, ~/.config/querion/config.json,
 * then .env in this project. Reads sessions from ~/.pi/agent/sessions (or PI_SESSION_DIR).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const MAX_CHUNK_CHARS = 3_000_000;

function loadEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function resolveConfig() {
  const env = process.env;
  if (env.QUERION_URL && env.QUERION_SYNC_TOKEN) {
    return { url: env.QUERION_URL.replace(/\/+$/, ""), token: env.QUERION_SYNC_TOKEN };
  }

  const jsonPath =
    env.QUERION_CONFIG || join(homedir(), ".config", "querion", "config.json");
  if (existsSync(jsonPath)) {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));
    if (parsed.url && parsed.token) {
      return { url: String(parsed.url).replace(/\/+$/, ""), token: String(parsed.token) };
    }
  }

  const fileVars = {
    ...loadEnvFile(join(ROOT, ".env")),
    ...loadEnvFile(join(ROOT, ".env.local")),
  };
  const url = env.QUERION_URL || fileVars.QUERION_URL;
  const token = env.QUERION_SYNC_TOKEN || fileVars.QUERION_SYNC_TOKEN;
  if (url && token) return { url: url.replace(/\/+$/, ""), token };

  console.error(
    "Querion is not configured. Set QUERION_URL + QUERION_SYNC_TOKEN, or create ~/.config/querion/config.json.",
  );
  process.exit(1);
}

function walk(root, filter) {
  const files = [];
  const visit = (dir) => {
    let items;
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const path = join(dir, item);
      try {
        if (statSync(path).isDirectory()) visit(path);
        else if (item.endsWith(".jsonl")) files.push(path);
      } catch {
        // ignore
      }
    }
  };
  visit(root);
  if (!filter) return files;
  const needle = filter.toLowerCase();
  return files.filter((path) => path.toLowerCase().includes(needle));
}

function firstText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (block && block.type === "text" && typeof block.text === "string") return block.text;
  }
  return "";
}

function buildStats(entries) {
  let messageCount = 0;
  let userMessages = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let lastActivity = "";
  let leafId = null;
  let model = null;
  let provider = null;
  let name = null;
  let title = null;

  for (const entry of entries) {
    if (typeof entry.timestamp === "string" && entry.timestamp > lastActivity) {
      lastActivity = entry.timestamp;
    }
    if (typeof entry.id === "string") leafId = entry.id;
    if (entry.type === "session_info" && typeof entry.name === "string") name = entry.name;
    if (entry.type === "model_change") {
      provider = typeof entry.provider === "string" ? entry.provider : provider;
      model = typeof entry.modelId === "string" ? entry.modelId : model;
    }
    if (entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
    const role = entry.message.role;
    if (role === "user" || role === "assistant") messageCount += 1;
    if (role === "user") {
      userMessages += 1;
      if (!title) {
        const text = firstText(entry.message.content).replace(/\s+/g, " ").trim();
        if (text) title = text.length > 160 ? `${text.slice(0, 159)}…` : text;
      }
    }
    if (role === "assistant") {
      if (typeof entry.message.model === "string") model = entry.message.model;
      if (typeof entry.message.provider === "string") provider = entry.message.provider;
      const usage = entry.message.usage;
      if (usage && typeof usage === "object") {
        if (typeof usage.totalTokens === "number") totalTokens += usage.totalTokens;
        if (usage.cost && typeof usage.cost.total === "number") totalCost += usage.cost.total;
      }
    }
  }

  return { messageCount, userMessages, totalTokens, totalCost, lastActivity, leafId, model, provider, name, title };
}

function readSessionFile(path) {
  let lines;
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return null;
  }
  let header = null;
  const entries = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.type === "session") {
      if (!parsed.id) return null;
      header = {
        id: String(parsed.id),
        cwd: String(parsed.cwd ?? ""),
        version: typeof parsed.version === "number" ? parsed.version : 3,
        parentSession: parsed.parentSession,
        timestamp: parsed.timestamp ?? new Date().toISOString(),
      };
      continue;
    }
    entries.push(parsed);
  }
  if (!header) return null;
  return { header, entries };
}

function chunk(entries) {
  const chunks = [];
  let current = [];
  let size = 0;
  entries.forEach((entry, index) => {
    const serialized = JSON.stringify(entry);
    if (current.length > 0 && (size + serialized.length > MAX_CHUNK_CHARS || current.length >= 400)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push({ ...entry, seq: index });
    size += serialized.length;
  });
  if (current.length) chunks.push(current);
  return chunks.length ? chunks : [[]];
}

async function push(config, envelope, sourceFile) {
  const stats = buildStats(envelope.entries);
  const contentHash = createHash("sha256")
    .update(JSON.stringify(envelope.entries))
    .digest("hex");
  const chunks = chunk(envelope.entries);
  let redactions = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const body = {
      session: {
        id: envelope.header.id,
        cwd: envelope.header.cwd,
        version: envelope.header.version,
        parentSession: envelope.header.parentSession ?? null,
        name: stats.name,
        title: stats.title,
        model: stats.model,
        provider: stats.provider,
        leafId: stats.leafId,
        startedAt: envelope.header.timestamp,
        lastActivityAt: stats.lastActivity,
        sourceFile,
        contentHash,
        stats,
      },
      entries: chunks[index],
      done: index === chunks.length - 1,
    };

    const response = await fetch(`${config.url}/api/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} ${(await response.text()).slice(0, 200)}`);
    }
    const result = await response.json().catch(() => null);
    redactions += result?.redactions ?? 0;
  }

  return { entries: envelope.entries.length, redactions };
}

async function main() {
  const config = resolveConfig();
  const raw = process.argv.slice(2).join(" ").trim();
  const query = raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
  const root = process.env.PI_SESSION_DIR || join(homedir(), ".pi", "agent", "sessions");

  // An explicit .jsonl path syncs exactly that file; anything else is a filter.
  const files =
    query && query.endsWith(".jsonl") && existsSync(query) ? [query] : walk(root, query || undefined);

  if (files.length === 0) {
    console.error(`No sessions found under ${root}${query ? ` matching "${query}"` : ""}.`);
    process.exit(1);
  }

  console.log(`Syncing ${files.length} session(s) to ${config.url} …`);
  let synced = 0;
  let entries = 0;
  let redactions = 0;
  const failures = [];

  for (const file of files) {
    const envelope = readSessionFile(file);
    if (!envelope) {
      failures.push(file);
      continue;
    }
    try {
      const result = await push(config, envelope, file);
      synced += 1;
      entries += result.entries;
      redactions += result.redactions;
      process.stdout.write(`  ✓ ${file.replace(homedir(), "~")} (${result.entries} entries)\n`);
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
      process.stdout.write(`  ✕ ${file.replace(homedir(), "~")} — ${error.message}\n`);
    }
  }

  console.log(
    `\nDone. ${synced}/${files.length} sessions, ${entries} entries` +
      (redactions ? `, ${redactions} secrets redacted` : "") +
      (failures.length ? `, ${failures.length} failed` : ""),
  );
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
