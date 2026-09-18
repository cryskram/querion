import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteSessionButton } from "@/components/DeleteSessionButton";
import { Transcript } from "@/components/Transcript";
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "@/lib/format";
import { getSessionDetail } from "@/lib/sessions";
import { capEntriesForDisplay } from "@/lib/display";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 40;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wider text-overlay">
        {label}
      </div>
      <div
        className={`mt-0.5 truncate text-xs text-fg ${mono ? "font-mono text-[11px]" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

export default async function SessionDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getSessionDetail(id);

  if (!detail) notFound();

  const { session, branch, entries, branches } = detail;
  const title = session.name || session.title || "Untitled session";

  const totalPages = Math.max(Math.ceil(branch.length / PAGE_SIZE), 1);
  const requestedPage = Number(query.page) || totalPages;
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageBranch = branch.slice(start, start + PAGE_SIZE);
  const capped = capEntriesForDisplay(pageBranch);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/sessions"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-fg"
        >
          ← All sessions
        </Link>
        <DeleteSessionButton sessionId={session.id} />
      </div>

      <header className="rounded-2xl border border-surface bg-mantle/50 p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-surface2 bg-crust/70 px-2.5 py-1 text-[11px] font-medium text-accent2">
            <span className="text-accent">◆</span>
            {session.project}
          </span>
          {session.model ? (
            <span className="rounded-full border border-surface2 px-2.5 py-1 font-mono text-[11px] text-muted">
              {session.model}
            </span>
          ) : null}
          {branches > 0 ? (
            <span className="rounded-full border border-yellow/40 bg-yellow/10 px-2.5 py-1 text-[11px] text-yellow">
              {branches} branch {branches === 1 ? "entry" : "entries"}
            </span>
          ) : null}
          <span className="rounded-full border border-surface2 px-2.5 py-1 text-[11px] text-overlay">
            v{session.version}
          </span>
        </div>

        <h1 className="text-balance text-lg font-semibold leading-snug text-fg sm:text-xl">
          {title}
        </h1>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Meta label="Started" value={formatDateTime(session.startedAt)} />
          <Meta
            label="Duration"
            value={formatDuration(session.startedAt, session.lastActivityAt)}
          />
          <Meta label="Messages" value={formatNumber(session.messageCount)} />
          <Meta label="Tokens" value={formatNumber(session.totalTokens)} />
          <Meta label="Cost" value={formatCost(session.totalCost)} />
          <Meta label="Entries" value={formatNumber(entries.length)} />
        </div>

        <div className="mt-4 space-y-1 border-t border-surface pt-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-overlay">
            Working directory
          </div>
          <div className="break-all font-mono text-[11px] text-muted">{session.cwd}</div>
        </div>
      </header>

      <div className="flex items-center justify-between gap-3 text-[11px] text-overlay">
        <span>
          Entries {start + 1}–{Math.min(start + PAGE_SIZE, branch.length)} of{" "}
          {branch.length}
          {capped.truncatedCount > 0
            ? ` · ${capped.truncatedCount} long output${capped.truncatedCount === 1 ? "" : "s"} truncated`
            : ""}
        </span>
        {totalPages > 1 ? (
          <div className="flex items-center gap-1.5">
            <Link
              href={`/sessions/${session.id}?page=${page - 1}`}
              aria-disabled={page <= 1}
              className={`rounded-lg border border-surface2 px-2.5 py-1 transition ${
                page <= 1
                  ? "pointer-events-none opacity-40"
                  : "text-muted hover:border-surface3 hover:text-fg"
              }`}
            >
              ← Newer
            </Link>
            <span className="px-1">
              {page}/{totalPages}
            </span>
            <Link
              href={`/sessions/${session.id}?page=${page + 1}`}
              aria-disabled={page >= totalPages}
              className={`rounded-lg border border-surface2 px-2.5 py-1 transition ${
                page >= totalPages
                  ? "pointer-events-none opacity-40"
                  : "text-muted hover:border-surface3 hover:text-fg"
              }`}
            >
              Older →
            </Link>
          </div>
        ) : null}
      </div>

      <Transcript entries={capped.entries} />

      {totalPages > 1 ? (
        <nav className="flex items-center justify-between pt-2">
          <Link
            href={`/sessions/${session.id}?page=${page - 1}`}
            className={`rounded-xl border border-surface2 px-4 py-2 text-xs transition ${
              page <= 1
                ? "pointer-events-none opacity-40"
                : "text-muted hover:border-surface3 hover:text-fg"
            }`}
          >
            ← Newer entries
          </Link>
          <Link
            href={`/sessions/${session.id}?page=${page + 1}`}
            className={`rounded-xl border border-surface2 px-4 py-2 text-xs transition ${
              page >= totalPages
                ? "pointer-events-none opacity-40"
                : "text-muted hover:border-surface3 hover:text-fg"
            }`}
          >
            Older entries →
          </Link>
        </nav>
      ) : null}

      {branches > 0 ? (
        <p className="pt-2 text-center text-[11px] text-overlay">
          Showing the active branch. {branches} off-branch{" "}
          {branches === 1 ? "entry" : "entries"} stored but not shown.
        </p>
      ) : null}
    </div>
  );
}
