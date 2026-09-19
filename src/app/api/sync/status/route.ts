import { NextResponse, type NextRequest } from "next/server";
import { checkSyncToken } from "@/lib/auth";
import { getSyncStatus } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Incremental-sync handshake.
 *
 *   GET /api/sync/status?session=<id>
 *
 * Returns how many entries the server already holds and the `lastEntryId` at
 * the highest `seq`. A client compares this with its own entry list and uploads
 * only what is missing — no need to resend the whole transcript.
 *
 *   GET /api/sync/status?ids=<id>,<id>,...   (batch, for /sync all)
 */
export async function GET(request: NextRequest) {
  const token = process.env.QUERION_SYNC_TOKEN ?? "";
  if (!token) {
    return NextResponse.json({ error: "QUERION_SYNC_TOKEN is not set" }, { status: 500 });
  }
  if (!checkSyncToken(request.headers.get("authorization"), token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const idsParam = params.get("ids");
  const single = params.get("session");

  const ids = idsParam
    ? idsParam.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 500)
    : single
      ? [single]
      : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Provide ?session=<id> or ?ids=<id,id,...>" },
      { status: 400 },
    );
  }

  try {
    const statuses = await Promise.all(
      ids.map(async (id) => ({ id, ...(await getSyncStatus(id)) })),
    );
    if (single) return NextResponse.json({ ok: true, ...statuses[0] });
    return NextResponse.json({ ok: true, sessions: statuses });
  } catch (error) {
    console.error("sync status failed", error);
    return NextResponse.json({ error: "Failed to read sync status" }, { status: 500 });
  }
}
