import type { RawEntry, SessionEntryRow } from "./types";

/**
 * The transcript is hydrated on the client, so every entry is serialized into
 * the page. A handful of tool outputs can be megabytes each — cap very long
 * strings for display (never in the database) to keep pages mobile-friendly.
 * Base64 image blocks are left untouched.
 */
const MAX_STRING = 40_000;

interface CapState {
  count: number;
}

function capValue(value: unknown, state: CapState): unknown {
  if (typeof value === "string") {
    if (value.length <= MAX_STRING) return value;
    state.count += 1;
    const omitted = value.length - MAX_STRING;
    return `${value.slice(0, MAX_STRING)}\n\n… [${omitted.toLocaleString()} more characters truncated for display — full text is available via the API]`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => capValue(item, state));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "image" && typeof record.data === "string") return value;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      output[key] = capValue(item, state);
    }
    return output;
  }

  return value;
}

export function capEntriesForDisplay(entries: SessionEntryRow[]): {
  entries: SessionEntryRow[];
  truncatedCount: number;
} {
  const state: CapState = { count: 0 };
  const capped = entries.map((entry) => ({
    ...entry,
    data: capValue(entry.data, state) as RawEntry,
  }));
  return { entries: capped, truncatedCount: state.count };
}
