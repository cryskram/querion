/**
 * Single-password session auth.
 *
 * Works in both the Edge runtime (middleware) and the Node.js runtime (route
 * handlers) because it only relies on Web Crypto + btoa/atob.
 *
 * The cookie is `base64url(payload).base64url(HMAC-SHA256(secret, payload))`
 * where payload = { iat, exp }. There is no server-side session store — the
 * signature is the proof.
 */

export const SESSION_COOKIE = "querion_session";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToB64Url(value: string): string {
  return bytesToB64Url(encoder.encode(value));
}

function b64UrlToString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return bytesToB64Url(new Uint8Array(signature));
}

/** Constant-time string comparison (length differences still leak length). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function createSessionToken(
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const now = Date.now();
  const payload = stringToB64Url(JSON.stringify({ iat: now, exp: now + ttlMs }));
  const signature = await hmac(secret, payload);
  return `${payload}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;

  const expected = await hmac(secret, payload);
  if (!safeEqual(signature, expected)) return false;

  try {
    const decoded = JSON.parse(b64UrlToString(payload)) as { exp?: number };
    if (typeof decoded.exp !== "number" || decoded.exp < Date.now()) return false;
  } catch {
    return false;
  }
  return true;
}

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30) {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Bearer-token check for the machine-to-machine /api/sync endpoint. */
export function checkSyncToken(header: string | null, token: string): boolean {
  if (!header || !token) return false;
  const [scheme, value] = header.split(" ");
  if (!value || scheme.toLowerCase() !== "bearer") return false;
  return safeEqual(value, token);
}

/** Best-effort in-memory rate limiter for the login route. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || record.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  record.count += 1;
  return record.count <= max;
}
