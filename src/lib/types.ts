/**
 * Shared types for pi session content. Mirrors the pi session format
 * (https://github.com/earendil-works/pi-mono — docs/session-format.md).
 */

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  data: string; // base64
  mimeType: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
}

export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ContentBlock = TextContent | ImageContent | ThinkingContent | ToolCallContent;

export interface Usage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  totalTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
}

export interface UserMessage {
  role: "user";
  content: string | ContentBlock[];
  timestamp?: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: ContentBlock[];
  provider?: string;
  model?: string;
  api?: string;
  usage?: Usage;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: unknown;
  usage?: Usage;
  isError?: boolean;
  timestamp?: number;
}

export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | ContentBlock[];
  display?: boolean;
  details?: unknown;
  timestamp?: number;
}

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore?: number;
}

export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId?: string;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output?: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | CustomMessage
  | CompactionSummaryMessage
  | BranchSummaryMessage
  | BashExecutionMessage;

export interface RawEntry {
  type: string;
  id: string;
  parentId?: string | null;
  timestamp: string;
  message?: AgentMessage;
  // non-message entries
  summary?: string;
  fromId?: string;
  tokensBefore?: number;
  provider?: string;
  modelId?: string;
  thinkingLevel?: string;
  label?: string;
  targetId?: string;
  name?: string;
  customType?: string;
  data?: unknown;
  content?: string | ContentBlock[];
  display?: boolean;
}

export interface SessionSummary {
  id: string;
  parentSession: string | null;
  project: string;
  cwd: string;
  title: string | null;
  name: string | null;
  model: string | null;
  provider: string | null;
  version: number;
  startedAt: string;
  lastActivityAt: string;
  messageCount: number;
  userMessages: number;
  totalTokens: number;
  totalCost: number;
  leafId: string | null;
  syncedAt: string;
}

export interface SessionEntryRow {
  entryId: string;
  parentId: string | null;
  seq: number;
  type: string;
  role: string | null;
  timestamp: string;
  data: RawEntry;
}

/** Look up a tool call by id — used to pair toolResult rows with their call. */
export function findToolCall(
  entries: SessionEntryRow[],
  toolCallId: string,
): { name: string; args: Record<string, unknown> } | null {
  for (const entry of entries) {
    const message = entry.data.message;
    if (!message || !("content" in message)) continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === "toolCall" && block.id === toolCallId) {
        return { name: block.name, args: block.arguments ?? {} };
      }
    }
  }
  return null;
}

export function isTextContent(block: unknown): block is TextContent {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: string }).type === "text"
  );
}
