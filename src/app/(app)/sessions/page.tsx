import Link from "next/link";
import { SessionCard } from "@/components/SessionCard";
import { formatCost, formatNumber } from "@/lib/format";
import {
  countSessions,
  getGlobalStats,
  listProjects,
  listSessions,
} from "@/lib/sessions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

interface PageProps {
  searchParams: Promise<{ q?: string; project?: string; page?: string }>;
}

function buildQuery(base: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(base)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface bg-mantle/50 px-3.5 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-overlay">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

export default async function SessionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const project = params.project?.trim() || undefined;
  const page = Math.max(Number(params.page) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  let data: Awaited<
    ReturnType<
      () => Promise<{
        sessions: Awaited<ReturnType<typeof listSessions>>;
        total: number;
        projects: Awaited<ReturnType<typeof listProjects>>;
        stats: Awaited<ReturnType<typeof getGlobalStats>>;
      }>
    >
  > | null = null;
  let dbError: string | null = null;

  try {
    const [sessions, total, projects, stats] = await Promise.all([
      listSessions({ q, project, limit: PAGE_SIZE, offset }),
      countSessions(q, project),
      listProjects(),
      getGlobalStats(),
    ]);
    data = { sessions, total, projects, stats };
  } catch (error) {
    dbError = error instanceof Error ? error.message : "Unknown database error";
  }

  if (dbError || !data) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red/30 bg-red/5 p-6">
        <h1 className="text-lg font-semibold text-red">Database not reachable</h1>
        <p className="mt-2 text-sm text-muted">
          Querion could not reach Postgres. Set <code className="text-fg">DATABASE_URL</code> and{" "}
          <code className="text-fg">DIRECT_URL</code> in <code className="text-fg">.env</code>, then
          run <code className="text-fg">npm run migrate:deploy</code>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-surface bg-crust p-3 text-xs text-red">
          {dbError}
        </pre>
      </div>
    );
  }

  const { sessions, total, projects, stats } = data;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const showProjectChips = projects.length > 1;

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Sessions" value={formatNumber(stats.sessions)} />
        <Stat label="Messages" value={formatNumber(stats.messages)} />
        <Stat label="Tokens" value={formatNumber(stats.tokens)} />
        <Stat label="Cost" value={formatCost(stats.cost)} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form action="/sessions" method="get" className="relative flex-1">
            {project ? <input type="hidden" name="project" value={project} /> : null}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search sessions, projects, models…"
              className="w-full rounded-xl border border-surface2 bg-mantle px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-overlay focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </form>
          <div className="text-xs text-overlay">
            {total} {total === 1 ? "session" : "sessions"}
            {q ? ` for “${q}”` : ""}
          </div>
        </div>

        {showProjectChips ? (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={`/sessions${buildQuery({ q })}`}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                !project
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-surface2 text-muted hover:border-surface3 hover:text-fg"
              }`}
            >
              All
            </Link>
            {projects.map((entry) => (
              <Link
                key={entry.project}
                href={`/sessions${buildQuery({ q, project: entry.project })}`}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  project === entry.project
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-surface2 text-muted hover:border-surface3 hover:text-fg"
                }`}
              >
                {entry.project}
                <span className="ml-1.5 text-overlay">{entry.count}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface2 bg-mantle/40 p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-surface2 bg-crust text-xl text-accent">
            ◈
          </div>
          <h2 className="text-base font-semibold text-fg">
            {q || project ? "No matching sessions" : "No sessions yet"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            {q || project
              ? "Try a different search or clear the filters."
              : "Install the Querion pi extension and run /sync inside a pi session."}
          </p>
        </div>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </section>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between pt-2">
          <Link
            href={`/sessions${buildQuery({ q, project, page: String(page - 1) })}`}
            aria-disabled={page <= 1}
            className={`rounded-lg border border-surface2 px-3.5 py-1.5 text-xs transition ${
              page <= 1
                ? "pointer-events-none opacity-40"
                : "text-muted hover:border-surface3 hover:text-fg"
            }`}
          >
            ← Newer
          </Link>
          <span className="text-xs text-overlay">
            Page {page} / {totalPages}
          </span>
          <Link
            href={`/sessions${buildQuery({ q, project, page: String(page + 1) })}`}
            aria-disabled={page >= totalPages}
            className={`rounded-lg border border-surface2 px-3.5 py-1.5 text-xs transition ${
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "text-muted hover:border-surface3 hover:text-fg"
            }`}
          >
            Older →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
