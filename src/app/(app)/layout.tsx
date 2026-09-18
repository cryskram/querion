import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-surface0/80 bg-base/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/sessions" className="group flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-surface1 bg-mantle text-sm text-accent shadow-inner transition-colors group-hover:border-accent/50">
              ◈
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight text-fg">Querion</span>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-overlay0">
                session archive
              </span>
            </span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link href="/sessions" className="btn btn-ghost px-3 py-1.5">
              Sessions
            </Link>
            <a
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost hidden px-3 py-1.5 sm:inline-flex"
            >
              Health
            </a>
            <span className="mx-1 hidden h-5 w-px bg-surface0 sm:block" />
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 text-center text-[11px] text-overlay0 sm:px-6">
        Querion · synced from <code className="font-mono text-muted">pi</code> with{" "}
        <code className="font-mono text-muted">/sync</code>
      </footer>
    </div>
  );
}
