"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Login failed");
        setLoading(false);
        return;
      }

      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") ? next : "/sessions");
      router.refresh();
    } catch {
      setError("Network error. Is the server running?");
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-surface1 bg-mantle text-2xl text-accent shadow-lg shadow-crust/50">
            ◈
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Querion</h1>
          <p className="mt-1.5 text-xs text-muted">
            Your pi session archive. Private by default.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="panel p-6 shadow-2xl shadow-crust/60"
        >
          <label htmlFor="password" className="label">
            Password
          </label>

          <div className="relative mt-2">
            <input
              id="password"
              name="password"
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••••••"
              className="input pr-14 font-mono tracking-wide"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-overlay0 transition hover:bg-surface0/60 hover:text-fg"
            >
              {reveal ? "hide" : "show"}
            </button>
          </div>

          {error ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-red/30 bg-red/5 px-3 py-2 text-xs text-red">
              <span aria-hidden>✕</span>
              <span>{error}</span>
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || password.length === 0}
            className="btn btn-primary mt-5 w-full py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="spinner" /> Checking…
              </>
            ) : (
              "Enter"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-overlay0">
          Sessions are synced from pi with{" "}
          <code className="font-mono text-muted">/sync</code>.
        </p>
      </div>
    </main>
  );
}
