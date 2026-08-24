// Follow-up timing nudges (build-plan.md §C's "timing nudges" half — the
// generator half already shipped as Email Drafts' follow-up type). Pure,
// deterministic, zero AI cost — same daysSince() shape already established
// by lib/rejectionIntelligence.ts and lib/leverageSynthesizer.ts.
const NUDGE_THRESHOLD_DAYS = 7;

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export function shouldShowFollowUpNudge(applicationStatus: string | null, statusUpdatedAt: string | null): number | null {
  if (applicationStatus !== "applied") return null;
  const days = daysSince(statusUpdatedAt);
  if (days === null || days < NUDGE_THRESHOLD_DAYS) return null;
  return days;
}
