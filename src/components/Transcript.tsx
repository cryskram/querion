"use client";

import clsx from "clsx";
import { useMemo } from "react";
import { Collapsible } from "./Collapsible";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";
import { ToolCallCard } from "./ToolCallCard";
import { ToolResultCard } from "./ToolResultCard";
import { formatDateTime } from "@/lib/format";
import type {
  ContentBlock,
  RawEntry,
  SessionEntryRow,
  ToolResultMessage,
} from "@/lib/types";

function contentText(content: string | ContentBlock[] | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");
}

function contentImages(content: string | ContentBlock[] | undefined) {
  if (!content || typeof content === "string") return [];
  return content.filter(
    (block): block is { type: "image"; data: string; mimeType: string } =>
      block.type === "image",
  );
}

function MessageHeader({
  role,
  label,
  timestamp,
  copyText,
  accent,
}: {
  role: string;
  label: string;
  timestamp: string;
  copyText?: string;
  accent: string;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <span
        className={clsx(
          "flex h-6 w-6 items-center justify-center rounded-md border border-surface2 bg-crust text-[11px]",
          accent,
        )}
      >
        {role === "user" ? "▸" : role === "assistant" ? "◈" : "●"}
      </span>
      <span className="text-xs font-semibold text-fg">{label}</span>
      <span className="text-[10px] text-overlay" title={timestamp}>
        {formatDateTime(timestamp)}
      </span>
      <span className="ml-auto flex items-center gap-1.5">
        {copyText ? <CopyButton value={copyText} /> : null}
      </span>
    </div>
  );
}

function NoticeRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1 text-[11px] text-overlay">
      <span className="h-px flex-1 bg-surface" />
      <span className="whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-surface" />
    </div>
  );
}

function NativeImage({ data, mimeType }: { data: string; mimeType: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:${mimeType};base64,${data}`}
      alt="Attached image"
      className="max-h-[480px] rounded-xl border border-surface"
    />
  );
}

function SummaryCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone: "accent" | "yellow";
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-4",
        tone === "accent" ? "border-accent/30 bg-accent/5" : "border-yellow/30 bg-yellow/5",
      )}
    >
      <div
        className={clsx(
          "mb-2 text-[11px] font-semibold uppercase tracking-wider",
          tone === "accent" ? "text-accent" : "text-yellow",
        )}
      >
        {title}
      </div>
      <Markdown className="text-sm">{body}</Markdown>
    </div>
  );
}

export function Transcript({ entries }: { entries: SessionEntryRow[] }) {
  const toolCalls = useMemo(() => {
    const map = new Map<string, { name: string; args: Record<string, unknown> }>();
    for (const entry of entries) {
      const message = entry.data.message;
      if (!message || !("content" in message)) continue;
      const content = message.content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (block.type === "toolCall") {
          map.set(block.id, { name: block.name, args: block.arguments ?? {} });
        }
      }
    }
    return map;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-surface2 p-8 text-center text-sm text-muted">
        This session has no entries yet.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {entries.map((entry) => (
        <EntryView key={entry.entryId} entry={entry} toolCalls={toolCalls} />
      ))}
    </div>
  );
}

function EntryView({
  entry,
  toolCalls,
}: {
  entry: SessionEntryRow;
  toolCalls: Map<string, { name: string; args: Record<string, unknown> }>;
}) {
  const data: RawEntry = entry.data;
  const timestamp = entry.timestamp;

  switch (entry.type) {
    case "message":
      return <MessageEntry entry={entry} data={data} toolCalls={toolCalls} />;

    case "compaction":
      return (
        <SummaryCard
          title="Context compacted"
          tone="accent"
          body={
            data.summary ??
            `Compacted context${data.tokensBefore ? ` (~${data.tokensBefore.toLocaleString()} tokens)` : ""}.`
          }
        />
      );

    case "branch_summary":
      return (
        <SummaryCard
          title="Branch summary"
          tone="yellow"
          body={data.summary ?? "A branch was summarized here."}
        />
      );

    case "model_change":
      return (
        <NoticeRow>
          model → <span className="text-muted">{data.provider}/{data.modelId}</span>
        </NoticeRow>
      );

    case "thinking_level_change":
      return (
        <NoticeRow>
          thinking → <span className="text-muted">{data.thinkingLevel}</span>
        </NoticeRow>
      );

    case "session_info":
      return (
        <NoticeRow>
          named <span className="text-muted">{data.name}</span>
        </NoticeRow>
      );

    case "label":
      return (
        <NoticeRow>
          label <span className="text-accent">{data.label}</span> on {data.targetId}
        </NoticeRow>
      );

    case "custom":
    case "custom_message": {
      const text =
        typeof data.content === "string"
          ? data.content
          : contentText(data.content as ContentBlock[] | undefined);
      return (
        <div className="rounded-2xl border border-surface bg-mantle/40 p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-teal">
            {data.customType ?? "extension"}
          </div>
          {text ? <Markdown className="text-sm">{text}</Markdown> : null}
        </div>
      );
    }

    default:
      return (
        <Collapsible
          summary={
            <span className="font-mono text-[11px] text-overlay">
              {entry.type} · {entry.entryId}
            </span>
          }
        >
          <pre className="overflow-auto p-3 font-mono text-[11px] text-subtext">
            {JSON.stringify(data, null, 2)}
          </pre>
        </Collapsible>
      );
  }
}

function MessageEntry({
  entry,
  data,
  toolCalls,
}: {
  entry: SessionEntryRow;
  data: RawEntry;
  toolCalls: Map<string, { name: string; args: Record<string, unknown> }>;
}) {
  const message = data.message;
  const timestamp = entry.timestamp;

  if (!message) return null;

  if (message.role === "user") {
    const text = contentText(message.content);
    const images = contentImages(message.content);
    return (
      <article className="rounded-2xl border border-accent2/25 bg-accent2/[0.05] p-4">
        <MessageHeader
          role="user"
          label="You"
          timestamp={timestamp}
          copyText={text || undefined}
          accent="text-accent2"
        />
        {text ? <Markdown className="text-sm">{text}</Markdown> : null}
        {images.length ? (
          <div className="mt-3 space-y-2">
            {images.map((image, index) => (
              <NativeImage key={index} data={image.data} mimeType={image.mimeType} />
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  if (message.role === "assistant") {
    const blocks = Array.isArray(message.content) ? message.content : [];
    const textBlocks = blocks.filter(
      (block): block is { type: "text"; text: string } => block.type === "text",
    );
    const thinkingBlocks = blocks.filter(
      (block): block is { type: "thinking"; thinking: string } =>
        block.type === "thinking" && Boolean(block.thinking),
    );
    const toolCallsBlocks = blocks.filter(
      (block): block is { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> } =>
        block.type === "toolCall",
    );
    const fullText = textBlocks.map((block) => block.text).join("\n\n");

    return (
      <article className="rounded-2xl border border-surface bg-mantle/40 p-4">
        <MessageHeader
          role="assistant"
          label={message.model ? `Assistant · ${message.model}` : "Assistant"}
          timestamp={timestamp}
          copyText={fullText || undefined}
          accent="text-accent"
        />

        {thinkingBlocks.length ? (
          <div className="mb-3 space-y-2">
            {thinkingBlocks.map((block, index) => (
              <Collapsible
                key={index}
                tone="thinking"
                summary={
                  <span className="text-[11px] italic text-overlay">
                    thinking · {block.thinking.length.toLocaleString()} chars
                  </span>
                }
              >
                <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed text-subtext">
                  {block.thinking}
                </pre>
              </Collapsible>
            ))}
          </div>
        ) : null}

        {fullText ? <Markdown className="text-sm">{fullText}</Markdown> : null}

        {message.errorMessage ? (
          <p className="mt-3 rounded-lg border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">
            {message.errorMessage}
          </p>
        ) : null}

        {toolCallsBlocks.length ? (
          <div className="mt-3 space-y-2">
            {toolCallsBlocks.map((block) => (
              <ToolCallCard key={block.id} name={block.name} args={block.arguments ?? {}} />
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  if (message.role === "toolResult") {
    const result = message as ToolResultMessage;
    const call = toolCalls.get(result.toolCallId);
    return (
      <div className="pl-0 sm:pl-6">
        <ToolResultCard
          name={call?.name ?? result.toolName ?? "tool"}
          isError={Boolean(result.isError)}
          content={(result.content ?? []) as never}
        />
      </div>
    );
  }

  if (message.role === "compactionSummary") {
    return (
      <SummaryCard title="Compaction summary" tone="accent" body={message.summary ?? ""} />
    );
  }

  if (message.role === "branchSummary") {
    return <SummaryCard title="Branch summary" tone="yellow" body={message.summary ?? ""} />;
  }

  if (message.role === "bashExecution") {
    return (
      <div className="rounded-2xl border border-green/25 bg-green/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-green">
          <span className="font-mono">$</span> shell
          {typeof message.exitCode === "number" ? (
            <span className="text-overlay">exit {message.exitCode}</span>
          ) : null}
        </div>
        <pre className="overflow-auto rounded-lg border border-surface bg-crust p-2.5 font-mono text-[11px] text-fg">
          {message.command}
        </pre>
        {message.output ? (
          <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-surface bg-crust p-2.5 font-mono text-[11px] text-subtext">
            {message.output}
          </pre>
        ) : null}
      </div>
    );
  }

  if (message.role === "custom") {
    const text = contentText(message.content);
    return (
      <div className="rounded-2xl border border-teal/25 bg-teal/5 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-teal">
          {message.customType}
        </div>
        {text ? <Markdown className="text-sm">{text}</Markdown> : null}
      </div>
    );
  }

  return (
    <Collapsible
      summary={<span className="font-mono text-[11px] text-overlay">{String((message as { role?: string }).role ?? "unknown")}</span>}
    >
      <pre className="overflow-auto p-3 font-mono text-[11px] text-subtext">
        {JSON.stringify(message, null, 2)}
      </pre>
    </Collapsible>
  );
}
