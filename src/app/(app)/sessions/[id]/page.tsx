import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteSessionButton } from "@/components/DeleteSessionButton";
import { LinkSpinner } from "@/components/LinkSpinner";
import { Transcript } from "@/components/Transcript";
import { capEntriesForDisplay } from "@/lib/display";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "@/lib/format";
import { getSessionDetail } from "@/lib/sessions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; order?: string }>;
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div
        className={`mt-1 truncate text-xs text-fg ${mono ? "font-mono text-[11px]" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function OrderToggle({
  sessionId,
  order,
}: {
  sessionId: string;
  order: "asc" | "desc";
}) {
  const items: { value: "asc" | "desc"; label: string }[] = [
    { value: "asc", label: "Oldest" },
    { value: "desc", label: "Newest" },
  ];
  return (
    <div className="inline-flex items-center rounded-xl border border-surface1 bg-crust/70 p-0.5">
      {items.map((item) => {
        const active = item.value === order;
        return (
          <Link
            key={item.value}
            href={`/sessions/${sessionId}?order=${item.value}&page=1`}
            scroll={false}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
              active ? "bg-surface0 text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
            aria-current={active ? "true" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function SessionDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getSessionDetail(id);

  if (!detail) notFound();

  const { session, branch, entries, branches } = detail;
  const title = session.name || session.title || "Untitled session";

  const order: "asc" | "desc" = query.order === "desc" ? "desc" : "asc";
  const ordered = order === "desc" ? [...branch].reverse() : branch;

  const totalPages = Math.max(Math.ceil(ordered.length / PAGE_SIZE), 1);
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageBranch = ordered.slice(start, start + PAGE_SIZE);
  const capped = capEntriesForDisplay(pageBranch);
  const rangeStart = ordered.length === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + PAGE_SIZE, ordered.length);

  const pageLink = (target: number) =>
    `/sessions/${session.id}?order=${order}&page=${target}`;

  return (
    <div className="animate-fade-in">
      <div className="sticky top-14 z-30 -mx-4 mb-5 border-b border-surface0/80 bg-base/85 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/sessions" className="btn btn-ghost px-2.5 py-1.5">
            ← Sessions
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <OrderToggle sessionId={session.id} order={order} />
            {totalPages > 1 ? (
              <div className="inline-flex items-center gap-1">
                <Link
                  href={pageLink(page - 1)}
                  aria-disabled={page <= 1}
                  className={`btn px-2.5 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
                >
                  ←
                </Link>
                <span className="px-1 text-[11px] tabular-nums text-overlay0">
                  {page}/{totalPages}
                  <LinkSpinner className="ml-2 align-middle text-accent" />
                </span>
                <Link
                  href={pageLink(page + 1)}
                  aria-disabled={page >= totalPages}
                  className={`btn px-2.5 py-1.5 ${
                    page >= totalPages ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  →
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-center justify-between gap-3">
        <span className="text-[11px] text-overlay0">
          Session <span className="font-mono text-muted">{session.id.slice(0, 8)}</span>
        </span>
        <DeleteSessionButton sessionId={session.id} />
      </div>

      <header className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-surface1 text-blue">
            <span className="text-accent">◆</span>
            {session.project}
          </span>
          {session.model ? (
            <span className="chip font-mono text-[10px] text-muted">{session.model}</span>
          ) : null}
          {branches > 0 ? (
            <span className="chip border-yellow/40 bg-yellow/5 text-yellow">
              {branches} branch {branches === 1 ? "entry" : "entries"}
            </span>
          ) : null}
          <span className="chip text-overlay0">v{session.version}</span>
        </div>

        <h1 className="mt-3.5 text-balance text-lg font-semibold leading-snug tracking-tight text-fg sm:text-xl">
          {title}
        </h1>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-surface0/70 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          <Meta label="Started" value={formatDateTime(session.startedAt)} />
          <Meta label="Duration" value={formatDuration(session.startedAt, session.lastActivityAt)} />
          <Meta label="Messages" value={formatNumber(session.messageCount)} />
          <Meta label="Tokens" value={formatNumber(session.totalTokens)} />
          <Meta label="Cost" value={formatCost(session.totalCost)} />
          <Meta label="Entries" value={formatNumber(entries.length)} />
        </div>

        <div className="mt-5 border-t border-surface0/70 pt-4">
          <div className="label">Working directory</div>
          <div className="mt-1 break-all font-mono text-[11px] text-muted">{session.cwd}</div>
        </div>
      </header>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2 text-[11px] text-overlay0">
        <span className="tabular-nums">
          Entries {rangeStart}–{rangeEnd} of {ordered.length} ·{" "}
          <span className="text-muted">{order === "asc" ? "oldest first" : "newest first"}</span>
          {capped.truncatedCount > 0
            ? ` · ${capped.truncatedCount} long output${capped.truncatedCount === 1 ? "" : "s"} truncated`
            : ""}
        </span>
      </div>

      <Transcript entries={capped.entries} />

      {totalPages > 1 ? (
        <nav className="mt-6 flex items-center justify-between">
          <Link
            href={pageLink(page - 1)}
            className={`btn ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          >
            ← {order === "asc" ? "Newer entries" : "Older entries"}
          </Link>
          <span className="text-xs tabular-nums text-overlay0">
            {page} / {totalPages}
          </span>
          <Link
            href={pageLink(page + 1)}
            className={`btn ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
          >
            {order === "asc" ? "Older entries" : "Newer entries"} →
          </Link>
        </nav>
      ) : null}

      {branches > 0 ? (
        <p className="pt-6 text-center text-[11px] text-overlay0">
          Showing the active branch. {branches} off-branch{" "}
          {branches === 1 ? "entry" : "entries"} stored but not shown.
        </p>
      ) : null}
    </div>
  );
}
