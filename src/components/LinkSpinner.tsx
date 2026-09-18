"use client";

import { useLinkStatus } from "next/link";

/**
 * Inline pending indicator for a Next.js <Link>. Must be rendered inside the
 * Link. Renders nothing when idle, so reserve space with a wrapper if needed.
 */
export function LinkSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span aria-hidden className={className ? `spinner ${className}` : "spinner"} />;
}
