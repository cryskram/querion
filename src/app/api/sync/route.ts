import { NextResponse, type NextRequest } from "next/server";
import { checkSyncToken } from "@/lib/auth";
import { ingestSession, parseSyncPayload } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const token = process.env.QUERION_SYNC_TOKEN ?? "";
  if (!token) {
    return NextResponse.json({ error: "QUERION_SYNC_TOKEN is not set" }, { status: 500 });
  }

  if (!checkSyncToken(request.headers.get("authorization"), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseSyncPayload(body);
  if (!parsed.ok || !parsed.payload) {
    return NextResponse.json({ error: parsed.error ?? "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await ingestSession(parsed.payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("sync failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Sync failed: ${message}` }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "POST /api/sync",
    expects: { session: "object", entries: "array", done: "boolean" },
  });
}
