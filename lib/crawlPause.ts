// A kill switch for the background crons that write to the shared job index.
//
// Why this exists (2026-09-08, real incident). The database is a 500 MB free
// tier: one small shared instance with a burst IO budget, not a dedicated box.
// Two full-table UPDATEs over 486k rows exhausted that budget and left the
// table bloated, so ordinary queries started hitting the 8s statement timeout.
//
// That alone would have healed on its own. What stopped it healing was the
// crons. Three proactive crawls fire every 15 minutes, plus an hourly prune and
// the repair/recheck passes. Each runs on a 60s Vercel function; against a
// slow database every step blew that limit, and Inngest RETRIES a failed step.
// So each timeout became several more executions, each opening connections and
// issuing heavy queries against the very instance that was already too slow to
// answer them. Vercel's log for a nine-minute window was ~20 consecutive
// `POST /api/inngest -> 504 Task timed out after 60 seconds`.
//
// That is a feedback loop, and it cannot drain itself: the load that makes the
// database slow is caused by the database being slow. VACUUM never finishes,
// autovacuum never gets a turn, the IO budget never refills, and user searches
// time out behind all of it. The only exit is to remove the load.
//
// Deliberately an env var rather than a database flag: the thing being switched
// off is the database, so a flag stored there could not be read at exactly the
// moment it is needed most.
//
// The guard runs BEFORE any step.run and before any client is constructed, so a
// paused function completes instantly with no connection and no retry chain,
// rather than failing and being retried. Crons keep firing; they just no-op.
//
// Scope is EVERY cron-triggered function that touches the database, not just
// the crawls. The first version gated only the three crawls and the prune, on
// the reasoning that the others were lighter. That reasoning is wrong: weight
// is irrelevant when the failure mode is a 60s function timeout followed by
// Inngest retries. A small query against a starved database still times out,
// still gets retried, and still feeds the same loop -- reconcile-stuck-agent-
// runs alone fires every 15 minutes. Observed after the first pass: crawl
// traffic went quiet and 504s continued.
//
// User-facing work -- searches, scoring, anything a candidate is actively
// waiting on -- is never gated, so pausing costs background freshness rather
// than the product. The name stays CRAWL_PAUSED because it is already set in
// Doppler and all three Vercel environments; renaming it would be a rename
// with a live incident attached.

export function crawlPaused(): boolean {
    const value = (process.env.CRAWL_PAUSED ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes";
}

/**
 * The pause a cron should actually obey: the env kill switch above, OR the
 * admin-flipped soft pause in app_settings (2026-09-10, System Health page).
 *
 * The two are deliberately different tools, and the env var stays primary —
 * see migrations/20260910190000_crawl-pause-setting.sql for the full
 * reasoning. Short version: the env var must keep working when the database
 * is too slow to answer, which is exactly the situation the 2026-09-08
 * outage created, so it can never be replaced by a row.
 *
 * Failure here degrades to the ENV value, never to "paused" and never to a
 * hang: the read is bounded at 3s, and if the database cannot answer a
 * single-row lookup in 3s the cron's real work was going to fail anyway.
 * Defaulting to "not paused" on a failed read is safe precisely because the
 * env var is still checked first and is the real safety net.
 */
export async function crawlPausedNow(): Promise<boolean> {
    if (crawlPaused()) return true;

    try {
        const { createAdminDbClient } = await import("@/lib/admin/client");
        const db = createAdminDbClient();
        const result = await Promise.race([
            db.database.from("app_settings").select("crawl_paused").limit(1).maybeSingle<{ crawl_paused: boolean }>(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
        ]);
        if (!result || result.error) return false;
        return result.data?.crawl_paused === true;
    } catch {
        return false;
    }
}

/** The value a paused cron returns, so a paused run is obvious in Inngest. */
export function pausedResult(what: string): { message: string; paused: true } {
    return { message: `${what} skipped: CRAWL_PAUSED is set.`, paused: true };
}
