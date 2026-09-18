"use client";

import clsx from "clsx";
import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — ignore.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={clsx(
        "rounded-md border border-surface2 px-2 py-0.5 text-[10px] font-medium text-muted transition hover:border-accent2/60 hover:text-accent2",
        className,
      )}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
