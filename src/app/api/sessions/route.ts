import { NextResponse, type NextRequest } from "next/server";
import {
  countSessions,
  getGlobalStats,
  listProjects,
  listSessions,
} from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = params.get("q")?.trim() || undefined;
  const project = params.get("project")?.trim() || undefined;
  const limit = Number(params.get("limit")) || 50;
  const offset = Number(params.get("offset")) || 0;

  try {
    const [sessions, total, projects, stats] = await Promise.all([
      listSessions({ q, project, limit, offset }),
      countSessions(q, project),
      listProjects(),
      getGlobalStats(),
    ]);

    return NextResponse.json({ sessions, total, projects, stats });
  } catch (error) {
    console.error("list sessions failed", error);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}
