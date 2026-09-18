import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-surface2 bg-mantle text-2xl text-accent">
        ◈
      </div>
      <h1 className="text-xl font-semibold text-fg">Not found</h1>
      <p className="max-w-sm text-sm text-muted">
        That session does not exist in Querion — it may have been deleted or never synced.
      </p>
      <Link
        href="/sessions"
        className="rounded-xl border border-surface2 px-4 py-2 text-xs text-muted transition hover:border-accent/60 hover:text-fg"
      >
        ← Back to sessions
      </Link>
    </main>
  );
}
