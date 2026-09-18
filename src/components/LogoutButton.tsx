"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-lg border border-surface2 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-red/50 hover:text-red disabled:opacity-50"
    >
      {busy ? "…" : "Log out"}
    </button>
  );
}
