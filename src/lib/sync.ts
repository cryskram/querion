import { prisma } from "./prisma";
import { redactString, redactValue } from "./redact";
import type { RawEntry } from "./types";

const MAX_ENTRIES_PER_REQUEST = 5000;

export interface SyncSessionMeta {
  id: string;
  cwd: string;
  version?: number;
  parentSession?: string | null;
  name?: string | null;
  title?: string | null;
  model?: string | null;
  provider?: string | null;
  leafId?: string | null;
  startedAt?: string | null;
  lastActivityAt?: string | null;
  sourceFile?: string | null;
  contentHash?: string | null;
  stats?: {
    messageCount?: number;
    userMessages?: number;
    totalTokens?: number;
    totalCost?: number;
  };
}

export interface SyncPayload {
  session: SyncSessionMeta;
  entries: (RawEntry & { seq?: number })[];
  seqOffset?: number;
  /** Total entries the client holds for this session (sent with the final chunk). */
  totalEntries?: number;
  done?: boolean;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
  payload?: SyncPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseSyncPayload(body: unknown): ValidationResult {
  if (!isRecord(body)) return { ok: false, error: "Body must be a JSON object" };
  if (!isRecord(body.session)) return { ok: false, error: "Missing `session` object" };

  const rawSession = body.session;
  const id = asString(rawSession.id);
  const cwd = asString(rawSession.cwd);
  if (!id) return { ok: false, error: "session.id is required" };
  if (!cwd) return { ok: false, error: "session.cwd is required" };

  if (!Array.isArray(body.entries)) {
    return { ok: false, error: "`entries` must be an array" };
  }
  if (body.entries.length > MAX_ENTRIES_PER_REQUEST) {
    return {
      ok: false,
      error: `Too many entries in one request (max ${MAX_ENTRIES_PER_REQUEST}); send in chunks`,
    };
  }

  for (const entry of body.entries) {
    if (!isRecord(entry) || !asString(entry.id) || !asString(entry.type)) {
      return { ok: false, error: "Every entry needs `id` and `type`" };
    }
  }

  const stats = isRecord(rawSession.stats) ? rawSession.stats : undefined;

  return {
    ok: true,
    payload: {
      session: {
        id,
        cwd,
        version: typeof rawSession.version === "number" ? rawSession.version : 3,
        parentSession: asString(rawSession.parentSession),
        name: asString(rawSession.name),
        title: asString(rawSession.title),
        model: asString(rawSession.model),
        provider: asString(rawSession.provider),
        leafId: asString(rawSession.leafId),
        startedAt: asString(rawSession.startedAt),
        lastActivityAt: asString(rawSession.lastActivityAt),
        sourceFile: asString(rawSession.sourceFile),
        contentHash: asString(rawSession.contentHash),
        stats: stats
          ? {
              messageCount: Number(stats.messageCount) || 0,
              userMessages: Number(stats.userMessages) || 0,
              totalTokens: Number(stats.totalTokens) || 0,
              totalCost: Number(stats.totalCost) || 0,
            }
          : undefined,
      },
      entries: body.entries as SyncPayload["entries"],
      seqOffset: typeof body.seqOffset === "number" ? body.seqOffset : 0,
      totalEntries:
        typeof body.totalEntries === "number" ? Math.max(0, body.totalEntries) : undefined,
      done: body.done === true,
    },
  };
}

function deriveProject(cwd: string): string {
  const clean = cwd.replace(/\/+$/, "");
  const base = clean.split("/").filter(Boolean).pop();
  return base || "~";
}

function deriveTitle(entries: SyncPayload["entries"]): string | null {
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    if (entry.message?.role !== "user") continue;
    const content = entry.message.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((block) =>
                isRecord(block) && typeof block.text === "string" ? block.text : "",
              )
              .join(" ")
          : "";
    const clean = text.replace(/\s+/g, " ").trim();
    if (clean) return clean.length > 160 ? `${clean.slice(0, 159)}…` : clean;
  }
  return null;
}

function parseDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

export interface IngestResult {
  sessionId: string;
  entriesWritten: number;
  entriesReceived: number;
  redactions: number;
  /** Total entries stored for this session after this chunk. */
  entryCount: number;
  /** entryId at the highest stored seq — the client's resume cursor. */
  lastEntryId: string | null;
  done: boolean;
}

export interface SyncStatus {
  exists: boolean;
  entryCount: number;
  lastEntryId: string | null;
  contentHash: string | null;
  done: boolean;
}

/**
 * Server-side cursor for a session, so a client with no local cache (fresh
 * machine, cleared cache) can still resume incrementally.
 */
export async function getSyncStatus(sessionId: string): Promise<SyncStatus> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { contentHash: true },
  });
  if (!session) {
    return { exists: false, entryCount: 0, lastEntryId: null, contentHash: null, done: false };
  }

  const last = await prisma.entry.findFirst({
    where: { sessionId },
    orderBy: { seq: "desc" },
    select: { entryId: true, seq: true },
  });

  return {
    exists: true,
    entryCount: last ? last.seq + 1 : 0,
    lastEntryId: last?.entryId ?? null,
    contentHash: session.contentHash,
    done: true,
  };
}

/**
 * Idempotent ingest. Each chunk upserts the session metadata and inserts any
 * new entries (keyed on [sessionId, entryId]). Re-syncing the same session is
 * therefore safe and cheap.
 */
export async function ingestSession(payload: SyncPayload): Promise<IngestResult> {
  const redactEnabled = process.env.QUERION_REDACT_SECRETS !== "false";
  const hideSource = process.env.QUERION_HIDE_SOURCE_PATH !== "false";

  const { session, entries, seqOffset = 0, done = false } = payload;
  const now = new Date();

  let redactions = 0;
  const prepared = entries.map((entry, index) => {
    const seq = typeof entry.seq === "number" ? entry.seq : seqOffset + index;
    // Always sanitize (Postgres jsonb rejects NUL / lone surrogates).
    const result = redactValue(entry as unknown as Record<string, unknown>, redactEnabled);
    redactions += result.count;
    const data = result.value as RawEntry;
    const messageRole =
      data.type === "message" && isRecord(data.message) && typeof data.message.role === "string"
        ? data.message.role
        : null;
    return {
      entryId: entry.id,
      parentId: entry.parentId ?? null,
      seq,
      type: entry.type,
      role: messageRole,
      timestamp: parseDate(entry.timestamp, now),
      data: data as unknown as object,
    };
  });

  const timestamps = prepared.map((entry) => entry.timestamp.getTime());
  const firstTimestamp = timestamps.length ? Math.min(...timestamps) : now.getTime();
  const lastTimestamp = timestamps.length ? Math.max(...timestamps) : now.getTime();

  const startedAt = parseDate(session.startedAt, new Date(firstTimestamp));
  const lastActivityAt = parseDate(session.lastActivityAt, new Date(lastTimestamp));

  const sourceFile =
    session.sourceFile && hideSource
      ? session.sourceFile.split("/").filter(Boolean).pop() ?? null
      : session.sourceFile;

  const rawTitle = session.title ?? deriveTitle(entries);
  const rawName = session.name ?? null;
  const title = rawTitle && redactEnabled ? redactString(rawTitle).value : rawTitle;
  const name = rawName && redactEnabled ? redactString(rawName).value : rawName;

  // Upsert the session shell first so entry FK is valid.
  await prisma.session.upsert({
    where: { id: session.id },
    create: {
      id: session.id,
      parentSession: session.parentSession ?? null,
      project: deriveProject(session.cwd),
      cwd: session.cwd,
      title,
      name,
      model: session.model ?? null,
      provider: session.provider ?? null,
      version: session.version ?? 3,
      startedAt,
      lastActivityAt,
      leafId: session.leafId ?? null,
      sourceFile,
      contentHash: session.contentHash ?? null,
    },
    update: {
      parentSession: session.parentSession ?? null,
      project: deriveProject(session.cwd),
      cwd: session.cwd,
      ...(title ? { title } : {}),
      ...(name ? { name } : {}),
      ...(session.model ? { model: session.model } : {}),
      ...(session.provider ? { provider: session.provider } : {}),
      version: session.version ?? 3,
      ...(session.leafId ? { leafId: session.leafId } : {}),
      ...(sourceFile ? { sourceFile } : {}),
      ...(session.contentHash ? { contentHash: session.contentHash } : {}),
      lastActivityAt: lastActivityAt > startedAt ? lastActivityAt : startedAt,
      syncedAt: now,
    },
  });

  // Insert entries in chunks. `skipDuplicates` makes this idempotent, so an
  // incremental upload that overlaps the server's existing prefix is safe.
  let written = 0;
  for (let i = 0; i < prepared.length; i += 500) {
    const chunk = prepared.slice(i, i + 500);
    const result = await prisma.entry.createMany({
      data: chunk.map((entry) => ({ ...entry, sessionId: session.id })),
      skipDuplicates: true,
    });
    written += result.count;
  }

  // `seq` is contiguous and 0-based, so the highest seq gives us both the cursor
  // and the stored count without a COUNT(*).
  let last = await prisma.entry.findFirst({
    where: { sessionId: session.id },
    orderBy: { seq: "desc" },
    select: { entryId: true, seq: true },
  });
  let entryCount = last ? last.seq + 1 : 0;

  if (done) {
    // If the client now holds fewer entries than we do (file truncated or
    // rewritten), drop the stale tail so the archive matches the source.
    const total = payload.totalEntries;
    if (typeof total === "number" && total < entryCount) {
      await prisma.entry.deleteMany({
        where: { sessionId: session.id, seq: { gte: total } },
      });
      last = await prisma.entry.findFirst({
        where: { sessionId: session.id },
        orderBy: { seq: "desc" },
        select: { entryId: true, seq: true },
      });
      entryCount = last ? last.seq + 1 : 0;
    }

    const [messageCount, userMessages] = await Promise.all([
      prisma.entry.count({ where: { sessionId: session.id, type: "message" } }),
      prisma.entry.count({
        where: { sessionId: session.id, type: "message", role: "user" },
      }),
    ]);

    await prisma.session.update({
      where: { id: session.id },
      data: {
        messageCount,
        userMessages,
        entryCount,
        lastEntryId: last?.entryId ?? null,
        totalTokens: session.stats?.totalTokens ?? undefined,
        totalCost: session.stats?.totalCost ?? undefined,
        leafId: session.leafId ?? undefined,
        syncedAt: now,
      },
    });
  } else {
    // Keep the cursor current even if this sync is interrupted mid-way.
    await prisma.session.update({
      where: { id: session.id },
      data: { entryCount, lastEntryId: last?.entryId ?? null, syncedAt: now },
    });
  }

  return {
    sessionId: session.id,
    entriesWritten: written,
    entriesReceived: prepared.length,
    redactions,
    entryCount,
    lastEntryId: last?.entryId ?? null,
    done,
  };
}
