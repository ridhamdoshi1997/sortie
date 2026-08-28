import { headers } from "next/headers";

// Country/region-aware pricing (build-plan.md, direct user request,
// 2026-08-28). Vercel stamps x-vercel-ip-country on every request at the
// edge, independent of proxy.ts (this app's Next.js 16 middleware
// equivalent) — readable via headers() in any Server Component/Server
// Action/Route Handler with zero extra API calls, zero added latency.
// Precedent for reading a Vercel-forwarded header directly (rather than
// adding middleware) already exists in lib/ipRateLimit.ts's getClientIp().
export async function getRequestCountry(): Promise<string | null> {
  const h = await headers();
  const vercelCountry = h.get("x-vercel-ip-country");
  if (vercelCountry) return vercelCountry.toUpperCase();

  // Local/off-Vercel dev has no header — lets regional pricing be QA'd
  // without deploying. Dev-only; never trusted in production, since a
  // production request always carries the real Vercel-supplied header.
  if (process.env.NODE_ENV !== "production" && process.env.DEV_COUNTRY_OVERRIDE) {
    return process.env.DEV_COUNTRY_OVERRIDE.toUpperCase();
  }

  return null;
}
