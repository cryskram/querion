"use client";

import clsx from "clsx";
import { Collapsible } from "./Collapsible";
import { CopyButton } from "./CopyButton";
import type { ContentBlock } from "@/lib/types";

interface ToolResultCardProps {
  name: string;
  isError: boolean;
  content: (ContentBlock | { type: string; [key: string]: unknown })[];
}

export function ToolResultCard({ name, isError, content }: ToolResultCardProps) {
  const textBlocks = content.filter(
    (block): block is { type: "text"; text: string } =>
      block.type === "text" && typeof (block as { text?: unknown }).text === "string",
  );
  const imageBlocks = content.filter(
    (block): block is { type: "image"; data: string; mimeType: string } =>
      block.type === "image" &&
      typeof (block as { data?: unknown }).data === "string" &&
      typeof (block as { mimeType?: unknown }).mimeType === "string",
  );

  const text = textBlocks.map((block) => block.text).join("\n");
  const lines = text ? text.split("\n").length : 0;
  const characters = text.length;

  const preview = isError
    ? "failed"
    : `${lines} ${lines === 1 ? "line" : "lines"} · ${characters.toLocaleString()} chars`;

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={clsx(
          "font-mono text-[11px]",
          isError ? "text-red" : "text-green",
        )}
      >
        {isError ? "✕" : "✓"}
      </span>
      <span className="shrink-0 font-mono text-[11px] font-medium text-muted">
        {name} result
      </span>
      <span
        className={clsx(
          "truncate text-[11px]",
          isError ? "text-red/80" : "text-overlay",
        )}
      >
        {preview}
      </span>
    </span>
  );

  const shouldOpen = isError && text.length < 800;

  return (
    <Collapsible
      summary={summary}
      defaultOpen={shouldOpen}
      tone={isError ? "error" : "default"}
      bodyClassName="bg-crust/40"
    >
      <div className="space-y-2 p-3">
        {text ? (
          <div className="relative">
            <pre
              className={clsx(
                "max-h-[520px] overflow-auto rounded-lg border p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words",
                isError
                  ? "border-red/30 bg-red/5 text-red/90"
                  : "border-surface bg-crust text-subtext",
              )}
            >
              {text}
            </pre>
            <CopyButton value={text} className="absolute right-2 top-2" />
          </div>
        ) : null}

        {imageBlocks.map((block, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`image-${index}`}
            src={`data:${block.mimeType};base64,${block.data}`}
            alt={`Tool result image ${index + 1}`}
            className="max-h-[520px] rounded-lg border border-surface"
          />
        ))}

        {!text && imageBlocks.length === 0 ? (
          <p className="text-[11px] text-overlay">(no output)</p>
        ) : null}
      </div>
    </Collapsible>
  );
}
