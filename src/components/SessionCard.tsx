import Link from "next/link";
import { LinkSpinner } from "./LinkSpinner";
import { formatCost, formatNumber, formatRelative, truncate } from "@/lib/format";
import type { SessionSummary } from "@/lib/types";

export function SessionCard({ session }: { session: SessionSummary }) {
  const title = session.name || session.title || "Untitled session";
  const showPreview = Boolean(session.name && session.title);

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="group relative flex flex-col gap-3.5 overflow-hidden rounded-2xl border border-surface0 bg-mantle/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-mantle hover:shadow-lg hover:shadow-crust/60"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
      />

      <div className="flex items-center justify-between gap-3">
        <span className="chip border-surface1/80 text-blue">
          <span className="text-accent">◆</span>
          <span className="max-w-[10rem] truncate">{session.project}</span>
        </span>
        <span className="flex items-center gap-2 text-[11px] text-overlay0">
          <time dateTime={session.lastActivityAt} title={formatRelative(session.lastActivityAt)}>
            {formatRelative(session.lastActivityAt)}
          </time>
          <span className="inline-flex h-3 w-3 items-center justify-center">
            <LinkSpinner className="h-3 w-3 text-accent" />
          </span>
        </span>
      </div>

      <div className="space-y-1.5">
        <h2 className="line-clamp-2 text-[13px] font-semibold leading-snug text-fg transition-colors group-hover:text-accent">
          {truncate(title, 160)}
        </h2>
        {showPreview ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted">
            {truncate(session.title ?? "", 160)}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-surface0/70 pt-3 text-[11px] text-overlay0">
        <span className="tabular-nums">
          <span className="text-subtext0">{session.messageCount}</span> msgs
        </span>
        <Dot />
        <span className="tabular-nums">
          <span className="text-subtext0">{formatNumber(session.totalTokens)}</span> tok
        </span>
        <Dot />
        <span className="tabular-nums text-subtext0">{formatCost(session.totalCost)}</span>
        {session.model ? (
          <>
            <Dot />
            <span className="truncate font-mono text-[10px] text-muted">{session.model}</span>
          </>
        ) : null}
      </div>
    </Link>
  );
}

function Dot() {
  return <span className="text-surface2">·</span>;
}
