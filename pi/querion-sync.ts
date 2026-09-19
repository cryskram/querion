/**
 * Querion pi extension — `/sync`
 *
 * Pushes pi coding-agent sessions to a Querion server (POST /api/sync) so they
 * can be read from anywhere. Standalone: no runtime dependencies beyond Node
 * built-ins and pi's ExtensionAPI (type-only import).
 *
 * Loading (declarative):
 *   This file is loaded from ~/niri-desktop via `programs.pi.coding-agent.extensions`
 *   (see modules/core.nix). Do not copy it into ~/.pi/agent/extensions — the repo
 *   is the source of truth. For a one-off run: `pi -e ./querion-sync.ts`.
 *
 * Usage inside pi:
 *   /sync              sync the current session
 *   /sync <id|path>    sync one session by id, .jsonl path, or path substring
 *   /sync all          sync every session in ~/.pi/agent/sessions
 *   /sync all <text>   sync sessions whose path contains <text>
 *   /sync status       show resolved config + server health
 *
 * Config resolution (first match wins):
 *   1. env:  QUERION_URL (non-secret) + QUERION_SYNC_TOKEN
 *   2. env QUERION_URL + token file (QUERION_TOKEN_FILE, ~/.config/querion/token)
 *   3. $QUERION_CONFIG / ~/.config/querion/config.json / ~/.querion.json
 *      → { "url": "https://…", "token": "…" }  (or "tokenFile": "/path/to/token",
 *        and either field may instead come from the environment)
 *   4. .env in ~/Projects/querion, then .env in the current directory
 *
 * Declarative setup (recommended): a home-manager `xdg.configFile` writes
 * ~/.config/querion/config.json with { url, tokenFile } — read directly, with no
 * dependence on session environment variables reaching the GUI session. The
 * token itself lives in a gitignored file and is never committed.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_KEY = "querion";
const MAX_CHUNK_CHARS = 3_000_000; // stay well under Vercel's 4.5 MB request limit

interface QuerionConfig {
  url: string;
  token: string;
  source: string;
}

interface SessionEnvelope {
  header: {
    id: string;
    cwd: string;
    version: number;
    parentSession?: string;
    timestamp: string;
    leafId?: string | null;
  };
  entries: Record<string, unknown>[];
}

function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function parseEnvFile(path: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
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
      result[match[1]] = value;
    }
  } catch {
    // Ignore unreadable env files.
  }
  return result;
}

function isPlaceholder(value: string): boolean {
  return /CHANGE[-_]?ME|REPLACE|PLACEHOLDER|<[^>]+>/i.test(value);
}

function tokenFileCandidates(): string[] {
  return [
    process.env.QUERION_TOKEN_FILE,
    join(homedir(), ".config", "querion", "token"),
    join(homedir(), ".config", "querion", "token.txt"),
  ].filter((value): value is string => Boolean(value));
}

function readTokenFile(): { token: string; source: string } | null {
  for (const path of tokenFileCandidates()) {
    if (!existsSync(path)) continue;
    try {
      const token = readFileSync(path, "utf8").trim();
      if (token && !isPlaceholder(token)) return { token, source: path };
    } catch {
      // Ignore unreadable token files.
    }
  }
  return null;
}

function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function readTokenFrom(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const resolved = expandHome(path);
  if (!existsSync(resolved)) return undefined;
  try {
    const token = readFileSync(resolved, "utf8").trim();
    return token && !isPlaceholder(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

function loadConfig(cwd: string): { config: QuerionConfig | null; hint: string } {
  const env = process.env;

  const envUrl =
    env.QUERION_URL && !isPlaceholder(env.QUERION_URL)
      ? normalizeUrl(env.QUERION_URL)
      : undefined;
  const envToken =
    env.QUERION_SYNC_TOKEN && !isPlaceholder(env.QUERION_SYNC_TOKEN)
      ? env.QUERION_SYNC_TOKEN
      : undefined;

  if (envUrl && envToken) {
    return {
      config: { url: envUrl, token: envToken, source: "environment variables" },
      hint: "Set QUERION_URL and QUERION_SYNC_TOKEN in your shell.",
    };
  }

  const tokenFile = readTokenFile();
  if (envUrl && tokenFile) {
    return {
      config: {
        url: envUrl,
        token: tokenFile.token,
        source: `environment URL + ${tokenFile.source}`,
      },
      hint: "Set QUERION_SYNC_TOKEN in your shell, or create ~/.config/querion/token.",
    };
  }

  const jsonCandidates = [
    env.QUERION_CONFIG,
    join(homedir(), ".config", "querion", "config.json"),
    join(homedir(), ".querion.json"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of jsonCandidates) {
    if (!existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
        url?: string;
        token?: string;
        tokenFile?: string;
      };
      const url =
        parsed.url && !isPlaceholder(parsed.url) ? normalizeUrl(parsed.url) : envUrl;
      const token =
        parsed.token && !isPlaceholder(parsed.token)
          ? parsed.token
          : (envToken ?? tokenFile?.token ?? readTokenFrom(parsed.tokenFile));
      if (url && token) {
        return {
          config: { url, token, source: candidate },
          hint: `Add url + token or tokenFile to ${candidate}.`,
        };
      }
    } catch {
      // Ignore malformed config.
    }
  }

  const envFileCandidates = [
    join(homedir(), "Projects", "querion", ".env"),
    join(homedir(), "Projects", "querion", ".env.local"),
    join(cwd, ".env"),
  ];

  for (const candidate of envFileCandidates) {
    if (!existsSync(candidate)) continue;
    const values = parseEnvFile(candidate);
    const url =
      values.QUERION_URL && !isPlaceholder(values.QUERION_URL)
        ? normalizeUrl(values.QUERION_URL)
        : envUrl;
    const token =
      values.QUERION_SYNC_TOKEN && !isPlaceholder(values.QUERION_SYNC_TOKEN)
        ? values.QUERION_SYNC_TOKEN
        : (envToken ?? tokenFile?.token);
    if (url && token) {
      return {
        config: { url, token, source: candidate },
        hint: `Set QUERION_URL and QUERION_SYNC_TOKEN in ${candidate}.`,
      };
    }
  }

  return {
    config: null,
    hint:
      "Set QUERION_URL + QUERION_SYNC_TOKEN, create ~/.config/querion/token, or create ~/.config/querion/config.json with { url, token }.",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  for (const block of content) {
    if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
      return block.text;
    }
  }
  return "";
}

function buildStats(entries: Record<string, unknown>[]) {
  let messageCount = 0;
  let userMessages = 0;
  let totalTokens = 0;
  let totalCost = 0;
  let lastActivity = "";
  let leafId: string | null = null;
  let model: string | null = null;
  let provider: string | null = null;
  let name: string | null = null;
  let title: string | null = null;

  for (const entry of entries) {
    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : "";
    if (timestamp && timestamp > lastActivity) lastActivity = timestamp;
    if (typeof entry.id === "string") leafId = entry.id;

    if (entry.type === "session_info" && typeof entry.name === "string") {
      name = entry.name;
    }
    if (entry.type === "model_change") {
      if (typeof entry.provider === "string") provider = entry.provider;
      if (typeof entry.modelId === "string") model = entry.modelId;
    }
    if (entry.type !== "message" || !isRecord(entry.message)) continue;

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
      if (isRecord(usage)) {
        if (typeof usage.totalTokens === "number") totalTokens += usage.totalTokens;
        const cost = usage.cost;
        if (isRecord(cost) && typeof cost.total === "number") totalCost += cost.total;
      }
    }
  }

  return {
    messageCount,
    userMessages,
    totalTokens,
    totalCost,
    lastActivity: lastActivity || null,
    leafId,
    model,
    provider,
    name,
    title,
  };
}

function readSessionFile(path: string): SessionEnvelope | null {
  let lines: string[];
  try {
    lines = readFileSync(path, "utf8").split("\n");
  } catch {
    return null;
  }

  let header: SessionEnvelope["header"] | null = null;
  const entries: Record<string, unknown>[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (parsed.type === "session") {
      header = {
        id: String(parsed.id ?? ""),
        cwd: String(parsed.cwd ?? ""),
        version: typeof parsed.version === "number" ? parsed.version : 3,
        parentSession: typeof parsed.parentSession === "string" ? parsed.parentSession : undefined,
        timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : new Date().toISOString(),
      };
      continue;
    }
    entries.push(parsed);
  }

  if (!header || !header.id) return null;
  return { header, entries };
}

function walkSessionFiles(root: string, filter?: string): string[] {
  const found: string[] = [];
  const visit = (dir: string) => {
    let items: string[];
    try {
      items = readdirSync(dir);
    } catch {
      return;
    }
    for (const item of items) {
      const path = join(dir, item);
      let isDirectory = false;
      try {
        isDirectory = statSync(path).isDirectory();
      } catch {
        continue;
      }
      if (isDirectory) visit(path);
      else if (item.endsWith(".jsonl")) found.push(path);
    }
  };
  visit(root);
  if (filter) {
    const needle = filter.toLowerCase();
    return found.filter((path) => path.toLowerCase().includes(needle));
  }
  return found;
}

function sortByMtime(files: string[]): string[] {
  return files
    .map((path) => {
      let mtime = 0;
      try {
        mtime = statSync(path).mtimeMs;
      } catch {
        // ignore unreadable files
      }
      return { path, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => entry.path);
}

/** Resolve a `/sync <query>` argument to session files (path, id, or substring). */
function resolveSessionFiles(query: string, cwd: string, root: string): string[] {
  const expanded = query.startsWith("~/") ? join(homedir(), query.slice(2)) : query;
  for (const candidate of [expanded, join(cwd, expanded)]) {
    if (candidate.endsWith(".jsonl") && existsSync(candidate)) return [candidate];
  }
  const needle = query.toLowerCase();
  return walkSessionFiles(root).filter((path) => path.toLowerCase().includes(needle));
}

function chunkEntries(entries: Record<string, unknown>[], startSeq = 0) {
  const chunks: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];
  let size = 0;

  entries.forEach((entry, index) => {
    const serialized = JSON.stringify(entry);
    if (current.length > 0 && (size + serialized.length > MAX_CHUNK_CHARS || current.length >= 400)) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push({ ...entry, seq: startSeq + index });
    size += serialized.length;
  });

  if (current.length) chunks.push(current);
  return chunks;
}

interface SyncStatus {
  exists: boolean;
  entryCount: number;
  lastEntryId: string | null;
  contentHash: string | null;
}

/**
 * Ask the server where it left off. Returns null when unreachable so callers can
 * fall back to a full upload (the server dedupes, so it is still correct).
 */
async function fetchServerStatus(
  config: QuerionConfig,
  sessionId: string,
): Promise<SyncStatus | null> {
  try {
    const response = await fetch(
      `${config.url}/api/sync/status?session=${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${config.token}` },
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<SyncStatus>;
    return {
      exists: body.exists === true,
      entryCount: typeof body.entryCount === "number" ? body.entryCount : 0,
      lastEntryId: typeof body.lastEntryId === "string" ? body.lastEntryId : null,
      contentHash: typeof body.contentHash === "string" ? body.contentHash : null,
    };
  } catch {
    return null;
  }
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Local fast-path cache: skip the status round-trip when nothing changed. */
function cachePath(sessionId: string): string {
  return join(homedir(), ".cache", "querion", "sessions", `${sessionId}.json`);
}

function readCache(sessionId: string): { count: number; hash: string } | null {
  try {
    const raw = readFileSync(cachePath(sessionId), "utf8");
    const parsed = JSON.parse(raw) as { count?: number; hash?: string };
    if (typeof parsed.count === "number" && typeof parsed.hash === "string") {
      return { count: parsed.count, hash: parsed.hash };
    }
  } catch {
    // No cache yet.
  }
  return null;
}

function writeCache(sessionId: string, count: number, hash: string): void {
  try {
    const path = cachePath(sessionId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ count, hash }), "utf8");
  } catch {
    // Cache is best-effort.
  }
}

interface PushResult {
  entries: number;
  uploaded: number;
  redactions: number;
  skipped: boolean;
}

/**
 * Incremental upload.
 *
 * 1. Hash the local entries; if the cache says nothing changed, stop here.
 * 2. Ask the server how many entries it has and which `lastEntryId` is last.
 * 3. Find that id in the local list and upload only what follows it.
 * 4. Fall back to a full (deduped) upload when the server state is unknown.
 */
async function pushSession(
  config: QuerionConfig,
  envelope: SessionEnvelope,
  sourceFile: string | null,
): Promise<PushResult> {
  const stats = buildStats(envelope.entries);
  const hash = shortHash(JSON.stringify(envelope.entries));
  const total = envelope.entries.length;

  const cached = readCache(envelope.header.id);
  if (cached && cached.hash === hash && cached.count === total) {
    return { entries: total, uploaded: 0, redactions: 0, skipped: true };
  }

  const server = await fetchServerStatus(config, envelope.header.id);

  // Decide the first entry that the server is missing.
  let startIndex = 0;
  if (server?.exists && server.entryCount > 0) {
    if (server.entryCount >= total) {
      // Server is at least as complete as we are; nothing new to send. Refresh
      // metadata only.
      startIndex = total;
    } else if (server.lastEntryId) {
      const found = envelope.entries.findIndex(
        (entry) => entry.id === server.lastEntryId,
      );
      // Upload from just after the server's cursor. When the cursor is not found
      // locally (rewritten file), fall back to a full deduped upload.
      startIndex = found >= 0 ? found + 1 : 0;
    }
  }

  const pending = envelope.entries.slice(startIndex);
  const chunks = chunkEntries(pending, startIndex);
  const isDelta = startIndex > 0;

  // A delta with nothing pending still needs one call to refresh session stats.
  if (chunks.length === 0) {
    chunks.push([]);
  }

  let redactions = 0;
  let uploaded = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    const isLast = index === chunks.length - 1;
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
        leafId: envelope.header.leafId ?? stats.leafId,
        startedAt: envelope.header.timestamp,
        lastActivityAt: stats.lastActivity,
        sourceFile,
        contentHash: hash,
        stats: {
          messageCount: stats.messageCount,
          userMessages: stats.userMessages,
          totalTokens: stats.totalTokens,
          totalCost: stats.totalCost,
        },
      },
      entries: chunks[index],
      // `seqOffset` is encoded in each entry's `seq` already.
      totalEntries: total,
      done: isLast,
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
      const text = await response.text().catch(() => "");
      throw new Error(
        `POST ${config.url}/api/sync → ${response.status} ${response.statusText}${
          text ? `: ${text.slice(0, 300)}` : ""
        }`,
      );
    }

    const result = (await response.json().catch(() => null)) as {
      redactions?: number;
    } | null;
    redactions += result?.redactions ?? 0;
    uploaded += chunks[index].length;
  }

  writeCache(envelope.header.id, total, hash);

  return {
    entries: total,
    uploaded: isDelta ? uploaded : total,
    redactions,
    skipped: false,
  };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("sync", {
    description:
      "Push pi sessions to Querion — /sync (current) · /sync <id|path> · /sync all [filter] · /sync status",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["all", "status", "current"];
      const items = subcommands
        .filter((value) => value.startsWith(prefix))
        .map((value) => ({ value, label: value }));
      if (items.length > 0) return items;

      const root = process.env.PI_SESSION_DIR || join(homedir(), ".pi", "agent", "sessions");
      return sortByMtime(walkSessionFiles(root))
        .slice(0, 20)
        .map((path) => {
          const base = path.split("/").pop() ?? path;
          const id = base.replace(/\.jsonl$/, "").split("_").pop() ?? base;
          return { value: id, label: id };
        })
        .filter((item) => item.value.startsWith(prefix));
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const subcommand = parts[0] ?? "current";
      const { config, hint } = loadConfig(ctx.cwd);

      if (!config) {
        ctx.ui.notify(`Querion is not configured. ${hint}`, "error");
        return;
      }

      if (subcommand === "status") {
        ctx.ui.setStatus(STATUS_KEY, "checking…");
        try {
          const response = await fetch(`${config.url}/api/health`, { cache: "no-store" });
          const payload = (await response.json().catch(() => null)) as
            | { ok?: boolean; db?: string; latencyMs?: number }
            | null;
          ctx.ui.setStatus(STATUS_KEY, undefined);
          ctx.ui.notify(
            `Querion: ${config.url} · db ${payload?.db ?? "unknown"} · ${
              response.ok ? "reachable" : `HTTP ${response.status}`
            } · config from ${config.source}`,
            response.ok ? "info" : "error",
          );
        } catch (error) {
          ctx.ui.setStatus(STATUS_KEY, undefined);
          ctx.ui.notify(
            `Querion unreachable at ${config.url}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            "error",
          );
        }
        return;
      }

      if (subcommand === "all") {
        const filter = parts.slice(1).join(" ") || undefined;
        const root = process.env.PI_SESSION_DIR || join(homedir(), ".pi", "agent", "sessions");
        const files = walkSessionFiles(root, filter);

        if (files.length === 0) {
          ctx.ui.notify(`No session files found under ${root}${filter ? ` matching "${filter}"` : ""}.`, "warning");
          return;
        }

        let synced = 0;
        let entries = 0;
        let uploaded = 0;
        let redactions = 0;
        const failures: string[] = [];

        ctx.ui.notify(`Syncing ${files.length} session${files.length === 1 ? "" : "s"} to Querion…`, "info");

        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          ctx.ui.setStatus(
            STATUS_KEY,
            `querion ${index + 1}/${files.length} · ${Math.round(((index + 1) / files.length) * 100)}%`,
          );
          const envelope = readSessionFile(file);
          if (!envelope) {
            failures.push(file);
            continue;
          }
          try {
            const result = await pushSession(config, envelope, file);
            synced += 1;
            entries += result.entries;
            uploaded += result.uploaded;
            redactions += result.redactions;
          } catch (error) {
            failures.push(`${file} (${error instanceof Error ? error.message : String(error)})`);
          }
        }

        ctx.ui.setStatus(STATUS_KEY, undefined);
        ctx.ui.notify(
          `Querion: synced ${synced}/${files.length} sessions · ${entries} entries` +
            `${uploaded < entries ? ` (${entries - uploaded} already up to date)` : ""}` +
            `${redactions > 0 ? ` · ${redactions} secrets redacted` : ""}` +
            `${failures.length ? ` · ${failures.length} failed` : ""}`,
          failures.length ? "warning" : "info",
        );
        if (failures.length) {
          ctx.ui.notify(`Failed: ${failures.slice(0, 3).join(", ")}`, "error");
        }
        return;
      }

      // Sync a specific session: /sync <session-id | .jsonl path | substring>
      const root = process.env.PI_SESSION_DIR || join(homedir(), ".pi", "agent", "sessions");
      const isCurrent = parts.length === 0 || subcommand === "current";

      if (!isCurrent) {
        const query = args.trim();
        const matches = resolveSessionFiles(query, ctx.cwd, root);

        if (matches.length === 0) {
          ctx.ui.notify(
            `No session found matching "${query}". Pass a session id, a .jsonl path, or run /sync all.`,
            "warning",
          );
          return;
        }
        if (matches.length > 1) {
          const preview = matches
            .slice(0, 5)
            .map((path) => `  ${path.replace(homedir(), "~")}`)
            .join("\n");
          ctx.ui.notify(
            `"${query}" matches ${matches.length} sessions — be more specific:\n${preview}`,
            "warning",
          );
          return;
        }

        const file = matches[0];
        const envelope = readSessionFile(file);
        if (!envelope) {
          ctx.ui.notify(`Could not read ${file}.`, "error");
          return;
        }

        ctx.ui.setStatus(STATUS_KEY, "syncing…");
        try {
          const result = await pushSession(config, envelope, file);
          ctx.ui.setStatus(STATUS_KEY, undefined);
          ctx.ui.notify(
            result.skipped
              ? `Querion: ${envelope.header.id} already up to date (${result.entries} entries).`
              : `Querion: synced ${envelope.header.id} · ${result.uploaded} new of ${result.entries} entries` +
                  `${result.redactions > 0 ? ` · ${result.redactions} secrets redacted` : ""}`,
            "info",
          );
        } catch (error) {
          ctx.ui.setStatus(STATUS_KEY, undefined);
          ctx.ui.notify(
            `Querion sync failed: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        }
        return;
      }

      // Default: sync the current session.
      const sessionFile = ctx.sessionManager.getSessionFile();
      const leafId = ctx.sessionManager.getLeafId();
      const rawEntries = ctx.sessionManager.getEntries() as unknown as Record<string, unknown>[];

      if (!rawEntries || rawEntries.length === 0) {
        ctx.ui.notify("Nothing to sync — this session is empty.", "warning");
        return;
      }

      const envelope: SessionEnvelope = {
        header: {
          id: ctx.sessionManager.getSessionId(),
          cwd: ctx.cwd,
          version: 3,
          timestamp:
            typeof (rawEntries[0]?.timestamp as string) === "string"
              ? (rawEntries[0].timestamp as string)
              : new Date().toISOString(),
        },
        entries: rawEntries,
      };

      // Keep the live leaf so the server renders the active branch.
      if (leafId) {
        envelope.header.leafId = leafId;
      }

      ctx.ui.setStatus(STATUS_KEY, "syncing…");
      try {
        const result = await pushSession(config, envelope, sessionFile ?? null);
        ctx.ui.setStatus(STATUS_KEY, undefined);
        ctx.ui.notify(
          result.skipped
            ? `Querion: already up to date (${result.entries} entries).`
            : `Querion: synced ${result.uploaded} new of ${result.entries} entries` +
                `${result.redactions > 0 ? ` · ${result.redactions} secrets redacted` : ""} → ${config.url}`,
          "info",
        );
      } catch (error) {
        ctx.ui.setStatus(STATUS_KEY, undefined);
        ctx.ui.notify(
          `Querion sync failed: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      }
    },
  });
}
