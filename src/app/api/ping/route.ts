import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Uptime-bot keep-alive endpoint.
 *
 * Public, unauthenticated, uncached, and deliberately tiny. It runs a real
 * query against the `Session` table (not just `SELECT 1`) so the database
 * registers genuine read activity — enough to keep a free Supabase project
 * from pausing / scaling down between syncs.
 *
 * Point your uptime monitor at:  GET /api/ping
 */
async function touchDatabase(): Promise<{ latencyMs: number }> {
  const started = Date.now();
  // Touch a real table + index so the query is not optimised away.
  await prisma.$queryRaw`SELECT "id" FROM "Session" ORDER BY "lastActivityAt" DESC LIMIT 1`;
  return { latencyMs: Date.now() - started };
}

function okHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Robots-Tag": "noindex, nofollow",
  };
}

export async function GET() {
  try {
    const { latencyMs } = await touchDatabase();
    return NextResponse.json(
      { ok: true, db: "up", latencyMs, time: new Date().toISOString() },
      { headers: okHeaders() },
    );
  } catch (error) {
    console.error("ping failed", error);
    return NextResponse.json(
      { ok: false, db: "down", time: new Date().toISOString() },
      { status: 503, headers: okHeaders() },
    );
  }
}

export async function HEAD() {
  try {
    await touchDatabase();
    return new Response(null, { status: 200, headers: okHeaders() });
  } catch {
    return new Response(null, { status: 503, headers: okHeaders() });
  }
}
