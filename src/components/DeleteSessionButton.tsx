"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    const confirmed = window.confirm(
      "Delete this session from Querion? The local pi session file is not affected.",
    );
    if (!confirmed) return;

    setBusy(true);
    const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" }).catch(
      () => null,
    );

    if (response?.ok) {
      router.replace("/sessions");
      router.refresh();
    } else {
      setBusy(false);
      window.alert("Failed to delete the session.");
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="btn px-3 py-1.5 text-xs hover:border-red/50 hover:text-red disabled:opacity-50"
    >
      {busy ? (
        <>
          <span className="spinner" /> Deleting…
        </>
      ) : (
        "Delete"
      )}
    </button>
  );
}
