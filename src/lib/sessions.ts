import { prisma } from "./prisma";
import type { RawEntry, SessionEntryRow, SessionSummary } from "./types";

type SessionWithCount = {
  id: string;
  parentSession: string | null;
  project: string;
  cwd: string;
  title: string | null;
  name: string | null;
  model: string | null;
  provider: string | null;
  version: number;
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  userMessages: number;
  totalTokens: number;
  totalCost: number;
  leafId: string | null;
  syncedAt: Date;
};

function toSummary(session: SessionWithCount): SessionSummary {
  return {
    ...session,
    startedAt: session.startedAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    syncedAt: session.syncedAt.toISOString(),
  };
}

export interface ListOptions {
  q?: string;
  project?: string;
  limit?: number;
  offset?: number;
}

export async function listSessions(options: ListOptions = {}): Promise<SessionSummary[]> {
  const { q, project } = options;
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const sessions = await prisma.session.findMany({
    where: {
      ...(project ? { project } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { cwd: { contains: q, mode: "insensitive" } },
              { project: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { lastActivityAt: "desc" },
    take: limit,
    skip: offset,
  });

  return sessions.map(toSummary);
}

export async function countSessions(q?: string, project?: string): Promise<number> {
  return prisma.session.count({
    where: {
      ...(project ? { project } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { cwd: { contains: q, mode: "insensitive" } },
              { project: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
  });
}

export async function listProjects(): Promise<
  { project: string; count: number; lastActivityAt: string }[]
> {
  const grouped = await prisma.session.groupBy({
    by: ["project"],
    _count: { _all: true },
    _max: { lastActivityAt: true },
    orderBy: { _max: { lastActivityAt: "desc" } },
  });

  return grouped.map((row) => ({
    project: row.project,
    count: row._count._all,
    lastActivityAt: (row._max.lastActivityAt ?? new Date(0)).toISOString(),
  }));
}

export async function getSession(id: string): Promise<SessionSummary | null> {
  const session = await prisma.session.findUnique({ where: { id } });
  return session ? toSummary(session) : null;
}

export interface SessionDetail {
  session: SessionSummary;
  entries: SessionEntryRow[];
  branch: SessionEntryRow[];
  branches: number;
}

export async function getSessionDetail(id: string): Promise<SessionDetail | null> {
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return null;

  const rows = await prisma.entry.findMany({
    where: { sessionId: id },
    orderBy: { seq: "asc" },
  });

  const entries: SessionEntryRow[] = rows.map((row) => ({
    entryId: row.entryId,
    parentId: row.parentId,
    seq: row.seq,
    type: row.type,
    role: row.role,
    timestamp: row.timestamp.toISOString(),
    data: row.data as unknown as RawEntry,
  }));

  const branch = computeActiveBranch(entries, session.leafId);
  const onBranch = new Set(branch.map((entry) => entry.entryId));
  const branches = entries.filter((entry) => !onBranch.has(entry.entryId)).length;

  return { session: toSummary(session), entries, branch, branches };
}

export async function deleteSession(id: string): Promise<boolean> {
  const result = await prisma.session.deleteMany({ where: { id } });
  return result.count > 0;
}

/**
 * Walk the parent chain from `leafId` back to the root and return the entries
 * root → leaf. Falls back to file order when the leaf is missing or the chain
 * is broken (e.g. partial sync).
 */
export function computeActiveBranch(
  entries: SessionEntryRow[],
  leafId: string | null,
): SessionEntryRow[] {
  if (entries.length === 0) return [];

  const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
  const start = (leafId && byId.get(leafId)) || entries[entries.length - 1];

  const path: SessionEntryRow[] = [];
  const seen = new Set<string>();
  let current: SessionEntryRow | undefined = start;

  while (current && !seen.has(current.entryId)) {
    seen.add(current.entryId);
    path.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  if (path.length <= 1 && entries.length > 1) {
    // Broken chain — fall back to linear order.
    return entries;
  }

  return path.reverse();
}

export async function getGlobalStats(): Promise<{
  sessions: number;
  messages: number;
  tokens: number;
  cost: number;
  projects: number;
}> {
  const [sessions, agg, projects] = await Promise.all([
    prisma.session.count(),
    prisma.session.aggregate({
      _sum: { messageCount: true, totalTokens: true, totalCost: true },
    }),
    prisma.session.groupBy({ by: ["project"] }).then((rows) => rows.length),
  ]);

  return {
    sessions,
    messages: agg._sum.messageCount ?? 0,
    tokens: agg._sum.totalTokens ?? 0,
    cost: agg._sum.totalCost ?? 0,
    projects,
  };
}
