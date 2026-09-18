import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-surface bg-base/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/sessions" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface2 bg-mantle text-accent">
              ◈
            </span>
            <span className="text-sm font-semibold tracking-tight text-fg">
              Querion
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-xs text-muted">
            <Link
              href="/sessions"
              className="rounded-lg px-3 py-1.5 transition hover:bg-surface/60 hover:text-fg"
            >
              Sessions
            </Link>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="hidden rounded-lg px-3 py-1.5 transition hover:bg-surface/60 hover:text-fg sm:block"
            >
              Health
            </a>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">{children}</main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 text-center text-[11px] text-overlay">
        Querion · synced from{" "}
        <code className="text-muted">pi</code> with <code className="text-muted">/sync</code>
      </footer>
    </div>
  );
}
