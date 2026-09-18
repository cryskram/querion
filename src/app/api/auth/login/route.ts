import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  createSessionToken,
  rateLimit,
  safeEqual,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ password: z.string().min(1).max(512) });

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";

  if (!rateLimit(`login:${ip}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a minute." },
      { status: 429 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const expected = process.env.QUERION_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";
  if (!expected || !secret) {
    return NextResponse.json(
      { error: "Server is missing QUERION_PASSWORD or AUTH_SECRET" },
      { status: 500 },
    );
  }

  if (!safeEqual(parsed.data.password, expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const token = await createSessionToken(secret);
  const { name, ...options } = sessionCookieOptions();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(name, token, options);
  return response;
}
