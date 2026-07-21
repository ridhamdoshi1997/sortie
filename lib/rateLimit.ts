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

  const { data: existing } = await insforge.database
    .from("rate_limit")
    .select("window_start,count")
    .eq("user_id", userId)
    .eq("route", route)
    .maybeSingle<{ window_start: string; count: number }>();

  const now = Date.now();
  const windowStartMs = existing ? new Date(existing.window_start).getTime() : 0;
  const windowExpired = !existing || now - windowStartMs > WINDOW_SECONDS * 1000;

  if (windowExpired) {
    await insforge.database
      .from("rate_limit")
      .upsert([{ user_id: userId, route, window_start: new Date().toISOString(), count: 1 }], {
        onConflict: "user_id,route",
      });
    return { allowed: true };
  }

  if (existing!.count >= MAX_PER_WINDOW) {
    return {
      allowed: false,
      error: "You're going a bit fast — please wait a moment and try again.",
    };
  }

  await insforge.database
    .from("rate_limit")
    .update({ count: existing!.count + 1 })
    .eq("user_id", userId)
    .eq("route", route);

  return { allowed: true };
}
