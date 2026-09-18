"use client";

import clsx from "clsx";
import { Collapsible } from "./Collapsible";
import { CopyButton } from "./CopyButton";

interface ToolCallCardProps {
  name: string;
  args: Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function ToolIcon({ name }: { name: string }) {
  const map: Record<string, { glyph: string; className: string }> = {
    bash: { glyph: "$", className: "text-green" },
    read: { glyph: "◫", className: "text-accent2" },
    write: { glyph: "✎", className: "text-peach" },
    edit: { glyph: "±", className: "text-yellow" },
    grep: { glyph: "⌕", className: "text-teal" },
    glob: { glyph: "✱", className: "text-teal" },
    webfetch: { glyph: "⇗", className: "text-sapphire" },
    websearch: { glyph: "⌕", className: "text-sapphire" },
    task: { glyph: "◈", className: "text-accent" },
  };
  const icon = map[name] ?? { glyph: "●", className: "text-muted" };
  return (
    <span className={clsx("font-mono text-[11px]", icon.className)}>{icon.glyph}</span>
  );
}

function DiffView({ oldString, newString }: { oldString: string; newString: string }) {
  const oldLines = oldString.length ? oldString.split("\n") : [];
  const newLines = newString.length ? newString.split("\n") : [];

  return (
    <pre className="max-h-[420px] overflow-auto bg-crust p-3 font-mono text-[11px] leading-relaxed">
      {oldLines.map((line, index) => (
        <div key={`old-${index}`} className="whitespace-pre-wrap text-red/85">
          <span className="select-none opacity-60">- </span>
          {line || " "}
        </div>
      ))}
      {newLines.map((line, index) => (
        <div key={`new-${index}`} className="whitespace-pre-wrap text-green/85">
          <span className="select-none opacity-60">+ </span>
          {line || " "}
        </div>
      ))}
    </pre>
  );
}

export function ToolCallCard({ name, args }: ToolCallCardProps) {
  const filePath = str(args.filePath) || str(args.path);
  const command = str(args.command);
  const oldString = str(args.oldString) ?? str(args.old_string);
  const newString = str(args.newString) ?? str(args.new_string);
  const content = str(args.content);
  const pattern = str(args.pattern);
  const url = str(args.url);

  let preview = "";
  if (name === "bash" && command) preview = command;
  else if (filePath) preview = filePath;
  else if (pattern) preview = pattern;
  else if (url) preview = url;
  else preview = JSON.stringify(args);

  const hasBody =
    name === "bash" ||
    name === "edit" ||
    name === "write" ||
    name === "read" ||
    Object.keys(args).length > 0;

  const summary = (
    <span className="flex min-w-0 items-center gap-2">
      <ToolIcon name={name} />
      <span className="shrink-0 font-mono text-[11px] font-semibold text-fg">{name}</span>
      <span className="min-w-0 truncate font-mono text-[11px] text-muted">{preview}</span>
    </span>
  );

  return (
    <Collapsible
      summary={summary}
      defaultOpen={false}
      className="border-surface bg-mantle/40"
      bodyClassName="bg-crust/40"
    >
      <div className="space-y-2 p-3">
        {name === "bash" && command ? (
          <div className="relative">
            <pre className="overflow-auto rounded-lg border border-surface bg-crust p-2.5 font-mono text-[11px] leading-relaxed text-fg">
              <span className="select-none text-green">$ </span>
              {command}
            </pre>
            <CopyButton value={command} className="absolute right-2 top-2" />
          </div>
        ) : null}

        {name === "edit" && (oldString !== undefined || newString !== undefined) ? (
          <div className="overflow-hidden rounded-lg border border-surface">
            <div className="flex items-center justify-between border-b border-surface bg-mantle px-2.5 py-1.5">
              <span className="truncate font-mono text-[10px] text-muted">{filePath}</span>
              {args.replaceAll === true ? (
                <span className="rounded bg-yellow/15 px-1.5 py-0.5 text-[10px] text-yellow">
                  replace all
                </span>
              ) : null}
            </div>
            <DiffView oldString={oldString ?? ""} newString={newString ?? ""} />
          </div>
        ) : null}

        {name === "write" && content !== undefined ? (
          <div className="overflow-hidden rounded-lg border border-surface">
            <div className="flex items-center justify-between border-b border-surface bg-mantle px-2.5 py-1.5">
              <span className="truncate font-mono text-[10px] text-muted">{filePath}</span>
              <CopyButton value={content} />
            </div>
            <pre className="max-h-[420px] overflow-auto bg-crust p-3 font-mono text-[11px] leading-relaxed text-fg">
              {content}
            </pre>
          </div>
        ) : null}

        {name === "read" ? (
          <div className="rounded-lg border border-surface bg-crust p-2.5 font-mono text-[11px] text-muted">
            {filePath}
            {args.offset !== undefined ? ` · offset ${String(args.offset)}` : ""}
            {args.limit !== undefined ? ` · limit ${String(args.limit)}` : ""}
          </div>
        ) : null}

        {name !== "bash" && name !== "edit" && name !== "write" && name !== "read" ? (
          <pre className="max-h-[360px] overflow-auto rounded-lg border border-surface bg-crust p-2.5 font-mono text-[11px] leading-relaxed text-subtext">
            {JSON.stringify(args, null, 2)}
          </pre>
        ) : null}

        {!hasBody ? null : null}
      </div>
    </Collapsible>
  );
}
