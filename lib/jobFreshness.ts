// Shared posting-age formatter. Lifted verbatim out of JobResultCard.tsx,
// where it was a private helper — the job DETAIL page needs the identical
// wording, and a second copy would drift. The search card showed a job's
// real posting age while the detail page for that same job showed nothing,
// which is the inconsistency this move exists to close.
export type PostedAge = { label: string; isFresh: boolean };

export function formatPostedAge(postedAt: string | null | undefined): PostedAge | null {
  if (!postedAt) return null;
  const ts = Date.parse(postedAt);
  if (Number.isNaN(ts)) return null;

  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 0) return null; // a future date is bad data, not freshness
  if (minutes < 60) return { label: minutes <= 1 ? "Just posted" : `${minutes} minutes ago`, isFresh: true };

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours} hour${hours === 1 ? "" : "s"} ago`, isFresh: true };

  const days = Math.floor(hours / 24);
  if (days < 30) return { label: `${days} day${days === 1 ? "" : "s"} ago`, isFresh: days <= 2 };

  const months = Math.floor(days / 30);
  return { label: `${months} month${months === 1 ? "" : "s"} ago`, isFresh: false };
}

// Display names for the `source_type` values job_sources stores (see that
// table's own column comment for the full set). Anything unknown is
// title-cased rather than dropped, so a newly-added provider still reads
// correctly before anyone remembers to add it here — the exact failure mode
// that let new providers get silently hidden elsewhere in this pipeline.
const SOURCE_LABELS: Record<string, string> = {
  serpapi: "Google Jobs",
  adzuna: "Adzuna",
  // Live values actually present in job_sources.source_type today are
  // "LinkedIn", "greenhouse" and "lever" — mixed casing, because providers
  // write their own display string. "linkedin" is mapped explicitly so the
  // title-case fallback does not render it as "Linkedin".
  linkedin: "LinkedIn",
  apify: "LinkedIn",
  apify_linkedin: "LinkedIn",
  apify_indeed: "Indeed",
  theirstack: "TheirStack",
  jobspipe: "JobsPipe",
  jsearch: "JSearch",
  remoteok: "RemoteOK",
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workday: "Workday",
  smartrecruiters: "SmartRecruiters",
  icims: "iCIMS",
  successfactors: "SuccessFactors",
};

export function formatSourceLabel(sourceType: string): string {
  const key = sourceType.toLowerCase().trim();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
