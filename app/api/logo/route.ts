import { NextRequest, NextResponse } from "next/server";

// Proxies third-party company-logo requests through this app's own origin —
// added 2026-07-28 after repeated live confirmation that direct client-side
// <img src> requests to logo.clearbit.com were failing silently in ways
// that never fired the browser's `error` event (broken-image glyph stuck
// forever, same symptom whether or not the app's own fallback/retry logic
// was in place). Most likely cause: an ad-blocker or tracking-protection
// extension silently blocking a known third-party data company's domain.
// Routing through our own origin sidesteps that entirely — the browser only
// ever talks to this app's own domain, and a real 404 from THIS server
// fires `onError` on the client reliably every time.
//
// Only a small, explicit host allowlist may be fetched here — this is a
// server-side fetch of a caller-supplied URL, which would otherwise be an
// open SSRF proxy.
const ALLOWED_HOSTS = ["logo.clearbit.com"];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 400 });
  }

  try {
    const upstream = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(8000),
    });

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!upstream.ok || !contentType.startsWith("image/")) {
      return NextResponse.json({ error: "No logo found" }, { status: 404 });
    }

    const buffer = await upstream.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Cached at the edge/browser for a day — a company's logo doesn't
        // change often enough to justify re-fetching it on every page view.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[api/logo]", error);
    return NextResponse.json({ error: "Failed to fetch logo" }, { status: 404 });
  }
}
