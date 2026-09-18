import Link from "next/link";
import { formatCost, formatNumber, formatRelative, truncate } from "@/lib/format";
import type { SessionSummary } from "@/lib/types";

export function SessionCard({ session }: { session: SessionSummary }) {
  const title = session.name || session.title || "Untitled session";
  const preview = session.title && session.name ? truncate(session.title, 160) : null;

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-surface bg-mantle/60 p-4 transition hover:border-surface2 hover:bg-mantle"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex max-w-[70%] items-center gap-1.5 rounded-full border border-surface2 bg-crust/70 px-2.5 py-1 text-[11px] font-medium text-accent2">
          <span className="text-accent">◆</span>
          <span className="truncate">{session.project}</span>
        </span>
        <time
          className="shrink-0 text-[11px] text-overlay"
          dateTime={session.lastActivityAt}
          title={session.lastActivityAt}
        >
          {formatRelative(session.lastActivityAt)}
        </time>
      </div>

      <div>
        <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-fg transition group-hover:text-accent">
          {truncate(title, 160)}
        </h2>
        {preview ? (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted">{preview}</p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-overlay">
        <span>{session.messageCount} msgs</span>
        <span className="text-surface3">·</span>
        <span>{formatNumber(session.totalTokens)} tok</span>
        <span className="text-surface3">·</span>
        <span>{formatCost(session.totalCost)}</span>
        {session.model ? (
          <>
            <span className="text-surface3">·</span>
            <span className="truncate font-mono text-[10px] text-muted">
              {session.model}
            </span>
          </>
        ) : null}
      </div>
    </Link>
  );
}
