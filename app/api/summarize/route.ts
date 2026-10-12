import { NextResponse } from "next/server";
import { summarize } from "@/lib/gemini";
import { scrapePage } from "@/lib/scrape";
import { UserError } from "@/lib/urlSafety";

export const runtime = "nodejs"; // needs node:dns and streaming fetch
export const maxDuration = 60;

// Tiny best-effort per-IP limiter so a public deployment can't burn the free API quota.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    if (rateLimited(ip)) {
      throw new UserError("Too many requests. Please wait a minute and try again.", 429);
    }

    const body = await request.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url : "";

    const page = await scrapePage(url);
    const summary = await summarize(page.title, page.text);

    return NextResponse.json({ title: page.title, url: page.finalUrl, summary });
  } catch (err) {
    if (err instanceof UserError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
  }
}
