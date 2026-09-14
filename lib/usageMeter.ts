import type { createInsforgeServer } from "@/lib/insforge-server";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;
type RpcResult<T> = { data: T | null; error: { message: string } | null };

// Every usage RPC exists in two forms (migration 20260914120000): one scoped
// to the signed-in user through auth.uid(), and a *_for(p_user_id, ...) twin
// that only service_role may execute. Callers hand over whichever client they
// have and this picks the right one.
//
// A cookie client succeeds on the first call. A service-role client — an
// Inngest job, a bearer-token API route — has no auth.uid(), so the user form
// raises "not authenticated" and the twin runs instead. The retry cannot widen
// anyone's access: a user's own client is refused by the twin outright.
//
// Before this existed, background callers passed the admin client straight
// into the user-scoped RPC and every one of them failed (verified live
// 2026-09-14): résumé suggestions were never generated, and the extension's
// score badge returned 429 for every user.
async function callUsageRpc<T>(
  insforge: Insforge,
  userFn: string,
  serviceFn: string,
  userId: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const first = (await insforge.database.rpc(userFn, args)) as RpcResult<T>;
  if (!first.error || !/not authenticated/i.test(first.error.message)) return first;
  return (await insforge.database.rpc(serviceFn, { p_user_id: userId, ...args })) as RpcResult<T>;
}

/** Atomic check-and-increment against a daily cap, on the user's own day. */
export async function incrementUsage(
  insforge: Insforge,
  userId: string,
  action: string,
  limit: number,
): Promise<RpcResult<{ new_count: number; allowed: boolean }[]>> {
  return callUsageRpc(insforge, "increment_usage_daily", "increment_usage_daily_for", userId, {
    p_action: action,
    p_limit: limit,
  });
}

/**
 * Counts usage without enforcing any cap — admin accounts, and AI work that is
 * tracked but never limited. Bookkeeping, never a gate: a failure is logged
 * and swallowed so it can never block the work it describes.
 */
export async function recordUsage(insforge: Insforge, userId: string, action: string, amount = 1): Promise<void> {
  if (amount < 1) return;
  try {
    const { error } = await callUsageRpc(insforge, "record_usage_daily", "record_usage_daily_for", userId, {
      p_action: action,
      // The RPC refuses more than 1000 at once; a single search never gets near it.
      p_amount: Math.min(Math.floor(amount), 1000),
    });
    if (error) console.error(`[lib/usageMeter] recording ${action} failed (non-blocking):`, error.message);
  } catch (error) {
    console.error(`[lib/usageMeter] recording ${action} threw (non-blocking):`, error);
  }
}

export type UsageWindow = {
  /** YYYY-MM-DD in the user's timezone — the usage_daily.day key. */
  day: string;
  /** The user's next local midnight, as an ISO timestamp. */
  resetsAt: string;
  /** IANA name; "UTC" until the browser has reported the user's zone. */
  timezone: string;
};

/**
 * The user's current usage day and when it ends, computed in the database
 * from their stored timezone — the same function the RPCs above use, so what
 * Settings reports and what actually blocks can never disagree. Falls back to
 * UTC only when the lookup itself fails.
 */
export async function getUsageWindow(insforge: Insforge, userId: string): Promise<UsageWindow> {
  const { data, error } = await callUsageRpc<{ day: string; resets_at: string; timezone: string }[]>(
    insforge,
    "my_usage_window",
    "usage_local_day",
    userId,
    {},
  );
  const row = data?.[0];
  if (!error && row) {
    return { day: row.day, resetsAt: new Date(row.resets_at).toISOString(), timezone: row.timezone };
  }
  if (error) console.error("[lib/usageMeter] usage window lookup failed, falling back to UTC:", error.message);
  const now = new Date();
  const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return { day: now.toISOString().slice(0, 10), resetsAt: nextUtcMidnight.toISOString(), timezone: "UTC" };
}
