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
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
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
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-surface2 bg-mantle text-2xl">
            <span className="text-accent">◈</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Querion</h1>
          <p className="mt-1.5 text-sm text-muted">
            Your pi session archive. Private by default.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-surface2 bg-mantle/80 p-6 shadow-2xl shadow-crust/60 backdrop-blur"
        >
          <label
            htmlFor="password"
            className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted"
          >
            Password
          </label>

          <div className="relative">
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
              className="w-full rounded-xl border border-surface2 bg-crust px-3.5 py-2.5 pr-11 text-sm text-fg outline-none transition placeholder:text-overlay focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-surface/60 hover:text-fg"
            >
              {reveal ? "hide" : "show"}
            </button>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || password.length === 0}
            className="mt-5 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-crust transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Checking…" : "Enter"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-overlay">
          Sessions are synced from pi with <code className="text-muted">/sync</code>.
        </p>
      </div>
    </main>
  );
}
