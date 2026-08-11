// Shared "is this listing still around?" logic — this app has no way to
// positively confirm a posting is live (see the migration comment on
// jobs.marked_unavailable_at/dropped_from_search_at), only ways to notice
// signals that it might not be. Three signals, ordered by confidence:
// user-confirmed > dropped from a repeat search > just old. Researched via
// agy before building: real job TRACKERS (Teal/Huntr/Simplify) don't try to
// re-scrape/HEAD-check external listings (soft-404s, anti-bot walls on
// Workday/Greenhouse make that unreliable) — they lean on user action plus
// cheap heuristics instead.

// Anything older than this without other signal gets the lowest-confidence
// "possible" badge — a soft nudge, not a claim.
export const STALE_AFTER_DAYS = 45;

// job.posted_at is NOT a real date — it's Google Jobs' own relative text
// ("2 days ago", "1 week ago") captured once at scrape time and never
// refreshed, so `new Date(job.posted_at)` is an Invalid Date (silently
// NaN'd out of any comparison, confirmed live: a job with posted_at set
// never tripped this check at all). found_at is a real, reliable DB
// timestamp — the only field here safe to compute age from.
export function isStaleByAge(job: { found_at: string | null }): boolean {
  if (!job.found_at) return false;
  const ageMs = Date.now() - new Date(job.found_at).getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

export type ListingSignal = {
  level: "confirmed" | "likely" | "possible";
  label: string;
};

type SignalInput = {
  marked_unavailable_at: string | null;
  dropped_from_search_at: string | null;
  found_at: string | null;
};

export function getListingSignal(job: SignalInput): ListingSignal | null {
  if (job.marked_unavailable_at) return { level: "confirmed", label: "No longer available" };
  if (job.dropped_from_search_at) return { level: "likely", label: "Not in your last search" };
  if (isStaleByAge(job)) return { level: "possible", label: "Found 45+ days ago" };
  return null;
}
