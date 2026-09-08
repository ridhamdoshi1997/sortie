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
// Scope is background writers only. User-facing work — searches, scoring,
// anything a candidate is waiting on — is never gated by this, so pausing
// degrades freshness of the index, not the product.

export function crawlPaused(): boolean {
    const value = (process.env.CRAWL_PAUSED ?? "").trim().toLowerCase();
    return value === "1" || value === "true" || value === "yes";
}

/** The value a paused cron returns, so a paused run is obvious in Inngest. */
export function pausedResult(what: string): { message: string; paused: true } {
    return { message: `${what} skipped: CRAWL_PAUSED is set.`, paused: true };
}
