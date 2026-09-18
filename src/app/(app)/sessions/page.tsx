import Link from "next/link";
import { LinkSpinner } from "@/components/LinkSpinner";
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

function StatTile({
  label,
  value,
  glyph,
  tone,
}: {
  label: string;
  value: string;
  glyph: string;
  tone: string;
}) {
  return (
    <div className="stat">
      <div className="flex items-center gap-1.5">
        <span className={`text-[11px] ${tone}`}>{glyph}</span>
        <span className="label">{label}</span>
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular-nums leading-none text-fg">
        {value}
      </div>
    </div>
  );
}

export default async function SessionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const project = params.project?.trim() || undefined;
  const page = Math.max(Number(params.page) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  let data: {
    sessions: Awaited<ReturnType<typeof listSessions>>;
    total: number;
    projects: Awaited<ReturnType<typeof listProjects>>;
    stats: Awaited<ReturnType<typeof getGlobalStats>>;
  } | null = null;
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
      <div className="mx-auto max-w-2xl animate-fade-in rounded-2xl border border-red/30 bg-red/5 p-6">
        <h1 className="text-lg font-semibold text-red">Database not reachable</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Querion could not reach Postgres. Set{" "}
          <code className="font-mono text-fg">DATABASE_URL</code> and{" "}
          <code className="font-mono text-fg">DIRECT_URL</code> in{" "}
          <code className="font-mono text-fg">.env</code>, then run{" "}
          <code className="font-mono text-fg">npm run db:deploy</code>.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-surface1 bg-crust p-3 text-xs text-red/90">
          {dbError}
        </pre>
      </div>
    );
  }

  const { sessions, total, projects, stats } = data;
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const hasFilters = Boolean(q || project);

  return (
    <div className="grid animate-fade-in gap-6 lg:grid-cols-[17rem_1fr] lg:gap-8">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="panel p-4">
          <h2 className="label">Archive</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatTile
              label="Sessions"
              value={formatNumber(stats.sessions)}
              glyph="◆"
              tone="text-accent"
            />
            <StatTile
              label="Messages"
              value={formatNumber(stats.messages)}
              glyph="▸"
              tone="text-blue"
            />
            <StatTile
              label="Tokens"
              value={formatNumber(stats.tokens)}
              glyph="✦"
              tone="text-teal"
            />
            <StatTile
              label="Cost"
              value={formatCost(stats.cost)}
              glyph="$"
              tone="text-green"
            />
          </div>
        </section>

        <section className="panel p-4">
          <h2 className="label">Search</h2>
          <form action="/sessions" method="get" className="mt-3">
            {project ? <input type="hidden" name="project" value={project} /> : null}
            <div className="relative">
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-overlay0"
              >
                ⌕
              </span>
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Title, project, model…"
                className="input py-2.5 pl-8 text-xs"
                autoComplete="off"
              />
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <button type="submit" className="btn btn-primary flex-1 py-2">
                Search
              </button>
              {hasFilters ? (
                <Link href="/sessions" className="btn btn-ghost py-2">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        {projects.length > 1 ? (
          <section className="panel p-4">
            <h2 className="label">Projects</h2>
            <ul className="mt-2.5 space-y-0.5">
              <li>
                <Link
                  href={`/sessions${buildQuery({ q })}`}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition ${
                    !project
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:bg-surface0/50 hover:text-fg"
                  }`}
                >
                  <span>All projects</span>
                  <span className="tabular-nums text-overlay0">{stats.projects}</span>
                </Link>
              </li>
              {projects.map((entry) => (
                <li key={entry.project}>
                  <Link
                    href={`/sessions${buildQuery({ q, project: entry.project })}`}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition ${
                      project === entry.project
                        ? "bg-accent/10 text-accent"
                        : "text-muted hover:bg-surface0/50 hover:text-fg"
                    }`}
                  >
                    <span className="truncate">{entry.project}</span>
                    <span className="tabular-nums text-overlay0">{entry.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-fg">Sessions</h1>
            {q ? (
              <span className="chip text-muted">
                “{q}”
                <Link
                  href={`/sessions${buildQuery({ project })}`}
                  className="text-overlay0 hover:text-red"
                  aria-label="Clear search"
                >
                  ✕
                </Link>
              </span>
            ) : null}
            {project ? (
              <span className="chip border-accent/30 text-accent">
                {project}
                <Link
                  href={`/sessions${buildQuery({ q })}`}
                  className="text-accent/70 hover:text-red"
                  aria-label="Clear project filter"
                >
                  ✕
                </Link>
              </span>
            ) : null}
          </div>
          <span className="text-xs tabular-nums text-overlay0">
            {total} {total === 1 ? "session" : "sessions"}
          </span>
        </div>

        {sessions.length === 0 ? (
          <div className="panel flex flex-col items-center px-6 py-14 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-surface1 bg-crust text-xl text-accent">
              ◈
            </div>
            <h2 className="text-sm font-semibold text-fg">
              {hasFilters ? "No matching sessions" : "No sessions yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted">
              {hasFilters
                ? "Try a different search or clear the filters."
                : "Run /sync inside a pi session (or /sync all for history) and they will appear here."}
            </p>
            {hasFilters ? (
              <Link href="/sessions" className="btn mt-4">
                Clear filters
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <nav className="flex items-center justify-between pt-1">
            <Link
              href={`/sessions${buildQuery({ q, project, page: String(page - 1) })}`}
              aria-disabled={page <= 1}
              className={`btn ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Newer
            </Link>
            <span className="text-xs tabular-nums text-overlay0">
              Page {page} / {totalPages}
              <LinkSpinner className="ml-2 align-middle text-accent" />
            </span>
            <Link
              href={`/sessions${buildQuery({ q, project, page: String(page + 1) })}`}
              aria-disabled={page >= totalPages}
              className={`btn ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
            >
              Older →
            </Link>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
