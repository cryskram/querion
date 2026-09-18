"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";

interface CollapsibleProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  tone?: "default" | "error" | "thinking";
}

export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  className,
  bodyClassName,
  tone = "default",
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-xl border",
        tone === "error" && "border-red/40 bg-red/5",
        tone === "thinking" && "border-surface0 bg-crust/50",
        tone === "default" && "border-surface0 bg-mantle/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface0/30"
        aria-expanded={open}
      >
        <span
          className={clsx(
            "shrink-0 text-[9px] text-overlay0 transition-transform",
            open && "rotate-90",
          )}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">{summary}</span>
      </button>
      {open ? (
        <div className={clsx("border-t border-surface0", bodyClassName)}>{children}</div>
      ) : null}
    </div>
  );
}
