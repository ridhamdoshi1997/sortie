import { NextRequest, NextResponse } from "next/server";

// Proxies third-party company-logo requests through this app's own origin.
//
// UPDATE 2026-07-28 (later same day): the original theory here — that
// logo.clearbit.com was being silently blocked by ad-blockers — was WRONG.
// Confirmed live: logo.clearbit.com no longer resolves in DNS at all
// ("Could not resolve host"), while other external hosts (google.com)
// resolve and connect fine from the same environment. Clearbit's free Logo
// API is dead, not blocked. Swapped the upstream to unavatar.io, which was
// confirmed live to behave the way Clearbit used to: a real company domain
// returns a real image, and (with `fallback=false`) an unresolvable domain
// returns a real error status instead of a silent generic placeholder.
// Google's favicon service was tried twice before and reverted both times
// for exactly that silent-placeholder failure mode — don't reintroduce it.
//
// Still worth keeping server-side: a real 404/error from THIS server fires
// the client's `onError` reliably, which a cross-origin DNS failure does
// not always do.
//
// Only a small, explicit host allowlist may be fetched here — this is a
// server-side fetch of a caller-supplied URL, which would otherwise be an
// open SSRF proxy.
//
// www.indeed.com added 2026-08-18 for PlatformLogo.tsx's real Indeed logo
// badge — unavatar.io itself returns a real, reproducible 429 for
// indeed.com specifically (confirmed live via direct curl, not a one-off:
// retried after a delay, still 429; linkedin.com hit the same 429 through
// unavatar, which is why that one stays on the existing hand-authored
// LinkedInGlyph.tsx instead of a fetch). Indeed's own favicon.ico, fetched
// directly, returns a normal 200 image with no such block — PlatformLogo.tsx
// hardcodes the exact target URL itself (not client-supplied), so this
// isn't opening the proxy to arbitrary Indeed paths.
const ALLOWED_HOSTS = ["unavatar.io", "www.indeed.com"];

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
