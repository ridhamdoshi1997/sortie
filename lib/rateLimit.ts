import type { createInsforgeServer } from "@/lib/insforge-server";
import { isAdminUser } from "@/lib/access";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;

// Minimum-cost public launch policy (see progress-tracker.md "Phase 0").
// A short, DB-backed fixed window per user per route — this is the real
// defense against burst/scripted abuse, and it also closes the race
// lib/usage.ts's read-then-write daily counter has on its own: a burst of
// truly parallel requests could all read the same under-limit daily count
// before any of them writes, each passing the check. A tight window here
// (a handful of calls per minute) makes that burst impossible in practice,
// not just improbable.
const WINDOW_SECONDS = 60;
const MAX_PER_WINDOW = 6;

type RateLimitResult = { allowed: true } | { allowed: false; error: string };

export async function checkRateLimit(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
  route: string,
): Promise<RateLimitResult> {
  if (isAdminUser(email)) {
    return { allowed: true };
  }

  // Atomic, server-authoritative window-check-and-increment via a SECURITY
  // DEFINER RPC (migration 20260829120000) — rate_limit no longer accepts a
  // direct client UPDATE/INSERT at all, closing a real bypass where a
  // signed-in user could PATCH their own row's count/window_start via the
  // REST API and defeat this table's whole reason for existing (the burst
  // defense the comment above already relies on to close usage_daily's own
  // race). This also makes the window-reset-vs-increment decision atomic.
  const { data, error } = (await insforge.database.rpc("bump_rate_limit", {
    p_route: route,
    p_window_seconds: WINDOW_SECONDS,
    p_max: MAX_PER_WINDOW,
  })) as { data: { new_count: number; allowed: boolean }[] | null; error: { message: string } | null };

  if (error) {
    console.error("[lib/rateLimit] bump_rate_limit failed:", error);
    return { allowed: true }; // fail open — a rate-limit outage shouldn't block real usage
  }

  if (!data?.[0]?.allowed) {
    return {
      allowed: false,
      error: "You're going a bit fast — please wait a moment and try again.",
    };
  }

  return { allowed: true };
}
