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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

function chunkEntries(entries: Record<string, unknown>[]) {
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
    current.push({ ...entry, seq: index });
    size += serialized.length;
  });

  if (current.length) chunks.push(current);
  return chunks;
}

async function pushSession(
  config: QuerionConfig,
  envelope: SessionEnvelope,
  sourceFile: string | null,
): Promise<{ entries: number; redactions: number }> {
  const stats = buildStats(envelope.entries);
  const hash = createHash("sha256")
    .update(JSON.stringify(envelope.entries))
    .digest("hex");

  const chunks = chunkEntries(envelope.entries);
  if (chunks.length === 0) chunks.push([]);

  let redactions = 0;

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
  }

  return { entries: envelope.entries.length, redactions };
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("sync", {
    description: "Push pi sessions to your Querion archive (usage: /sync | /sync all | /sync status)",
    getArgumentCompletions: (prefix: string) => {
      const options = ["all", "status"];
      const filtered = options.filter((option) => option.startsWith(prefix));
      return filtered.map((value) => ({ value, label: value }));
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
            redactions += result.redactions;
          } catch (error) {
            failures.push(`${file} (${error instanceof Error ? error.message : String(error)})`);
          }
        }

        ctx.ui.setStatus(STATUS_KEY, undefined);
        ctx.ui.notify(
          `Querion: synced ${synced}/${files.length} sessions · ${entries} entries` +
            `${redactions > 0 ? ` · ${redactions} secrets redacted` : ""}` +
            `${failures.length ? ` · ${failures.length} failed` : ""}`,
          failures.length ? "warning" : "info",
        );
        if (failures.length) {
          ctx.ui.notify(`Failed: ${failures.slice(0, 3).join(", ")}`, "error");
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
          `Querion: synced ${result.entries} entries` +
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
