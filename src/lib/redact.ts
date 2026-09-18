/**
 * Value hygiene for stored transcripts.
 *
 * 1. Sanitize — always on. Postgres `jsonb` cannot store NUL (`\u0000`) or
 *    lone UTF-16 surrogates, which show up in raw tool output. These are
 *    stripped/replaced so a sync never fails on binary-ish text.
 *
 * 2. Redact — high-confidence secrets (PEM keys, sk-…, AKIA…, ghp_…, …).
 *    Toggle with QUERION_REDACT_SECRETS=false.
 *
 * This is a safety net, not a guarantee.
 */

interface ProcessResult {
  value: unknown;
  count: number;
}

interface Pattern {
  name: string;
  regex: RegExp;
  replace: string;
}

const PLACEHOLDER = "[REDACTED]";

const PATTERNS: Pattern[] = [
  {
    name: "private-key",
    regex:
      /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: `-----BEGIN PRIVATE KEY-----\n${PLACEHOLDER}\n-----END PRIVATE KEY-----`,
  },
  { name: "aws-access-key", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replace: PLACEHOLDER },
  { name: "openai-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g, replace: PLACEHOLDER },
  { name: "anthropic-key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, replace: PLACEHOLDER },
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, replace: PLACEHOLDER },
  { name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: PLACEHOLDER },
  { name: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replace: PLACEHOLDER },
  {
    name: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g,
    replace: PLACEHOLDER,
  },
  {
    name: "quoted-assignment",
    regex:
      /(\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\b\s*[:=]\s*)(["'])([^"'\n]{6,})(\2)/gi,
    replace: `$1$2${PLACEHOLDER}$4`,
  },
  {
    name: "bare-assignment",
    regex:
      /(\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*)([A-Za-z0-9_\-+/=]{16,})/g,
    replace: `$1${PLACEHOLDER}`,
  },
];

/** Remove NUL and repair lone surrogates so Postgres can store the string. */
export function sanitizeString(input: string): string {
  let value = input.includes("\u0000") ? input.replace(/\u0000/g, "") : input;
  if (!/[\uD800-\uDFFF]/.test(value)) return value;

  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\uFFFD";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      result += "\uFFFD";
    } else {
      result += value[index];
    }
  }
  return result;
}

export function redactString(input: string): { value: string; count: number } {
  let value = input;
  let count = 0;
  for (const pattern of PATTERNS) {
    const matches = value.match(pattern.regex);
    if (!matches) continue;
    count += matches.length;
    value = value.replace(pattern.regex, pattern.replace);
  }
  return { value, count };
}

/**
 * Recursively sanitize (always) and, when `secrets` is true, redact every
 * string in a JSON-compatible value.
 */
export function redactValue(input: unknown, secrets = true): ProcessResult {
  if (typeof input === "string") {
    let value = sanitizeString(input);
    let count = 0;
    if (secrets) {
      const result = redactString(value);
      value = result.value;
      count = result.count;
    }
    return { value, count };
  }

  if (Array.isArray(input)) {
    let count = 0;
    const value = input.map((item) => {
      const result = redactValue(item, secrets);
      count += result.count;
      return result.value;
    });
    return { value, count };
  }

  if (input && typeof input === "object") {
    let count = 0;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
      const safeKey = sanitizeString(key);
      const result = redactValue(item, secrets);
      count += result.count;
      output[safeKey] = result.value;
    }
    return { value: output, count };
  }

  return { value: input, count: 0 };
}
