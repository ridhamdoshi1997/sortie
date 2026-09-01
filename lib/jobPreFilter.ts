// Phase 2 of the job-listing authenticity rework (2026-08-31) — a cheap,
// zero-AI-cost gate that runs BEFORE a job ever reaches the expensive
// 10-dimension LLM evaluation. Two distinct things happen here:
// (1) this module: reject obvious junk pre-evaluation, for free, so it
//     never spends an evaluation slot or a rate-limited AI call;
// (2) the LLM's own Legitimacy dimension (already existed) now also hard-
//     hides a job on a D/F grade instead of just labeling it with a
//     warning underneath a percentage — see the matching change in
//     lib/inngest/functions.ts's persist-chunk step.
// Both write to the existing `jobs.is_hidden` column, which the find-jobs
// page's own query already filters on (`.eq("is_hidden", false)`) — no UI
// change needed, hiding is already wired everywhere a job list renders.
// Minimal structural shape, not NormalizedJob specifically — this runs
// against canonical `jobs` rows (post-merge, DB shape) at the one real
// call site, and both shapes already share these exact field names.
type PreFilterableJob = {
  title?: string | null;
  company?: string | null;
  description?: string | null;
  salary?: string | null;
  posted_at?: string | null;
};

// Direct user follow-up (2026-09-01) after Adzuna started running on
// every search: Adzuna's own index carries genuinely old listings
// alongside fresh ones (a real, previously-measured 90-day filter already
// existed there, kept from an earlier session). This applies the SAME
// staleness bar to every source, not just Adzuna — a SerpApi/Google Jobs
// posting can sit around for a while too, and now that posted_at is
// reliably parsed into a real timestamp for every source (see
// lib/jobCanonicalization.ts's parsePostedAt, which fixed SerpApi's
// relative-date strings the same day), it's a real, comparable signal to
// gate on everywhere at once instead of duplicating the check per-source.
// 60 days (direct user request, 2026-09-01 — widened from an initial 45),
// tighter than Adzuna's old 90 but looser than "only this week" — a
// genuinely still-open role posted a month or two ago is common and
// shouldn't be treated as a ghost listing, while multi-month-stale
// reposts still get excluded.
const MAX_POSTING_AGE_DAYS = 60;

function isStale(postedAt: string | null | undefined): boolean {
  if (!postedAt) return false; // no date given is not evidence of staleness
  const ts = Date.parse(postedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts > MAX_POSTING_AGE_DAYS * 24 * 60 * 60 * 1000;
}

// Real staffing/body-shop agencies that list roles under their own name
// rather than the actual hiring company's — a real, named trust gap found
// during today's research (candidates lose the actual employer's identity
// and often end up C2C/contract instead of the direct role they searched
// for). A short, high-confidence list, not exhaustive — a false negative
// here just means the job isn't specially flagged, not a broken result; a
// false positive would incorrectly hide a real employer's own listing, so
// this stays conservative rather than trying to be comprehensive.
const STAFFING_AGENCY_NAMES = [
  "cybercoders",
  "revature",
  "braintrust",
  "aerotek",
  "teksystems",
  "randstad",
  "robert half",
  "insight global",
  "collabera",
  "apex systems",
];

// Excessive-caps / MLM-adjacent / "too good to be true" phrasing — kept
// deliberately narrow (a handful of high-signal patterns, not a broad
// keyword blocklist) since a real job posting can legitimately contain
// almost any individual word; it's the COMBINATION and framing that's the
// tell, and this is a cheap heuristic gate, not the actual legitimacy
// judgment (that's still the LLM's Legitimacy dimension, run afterward on
// whatever survives this gate).
const SPAM_PATTERNS = [/\bwork from home\b.*\bno experience\b/i, /\$\d{2,4}[\s/]*(hour|hr|day)\b.*\bno experience\b/i, /\bwire transfer\b/i, /\bsend.{0,15}deposit\b/i];

export type PreFilterResult = { hide: true; reason: string } | { hide: false };

// Deliberately conservative: only reject when a heuristic is high-
// confidence, never on ambiguous/borderline signals (see the module
// comment on STAFFING_AGENCY_NAMES for why) — hiding a real job by mistake
// is a worse failure than occasionally letting a low-quality one through
// to the AI's own, more nuanced Legitimacy grade.
export function preFilterJob(job: PreFilterableJob): PreFilterResult {
  if (!job.title?.trim() || !job.company?.trim()) {
    return { hide: true, reason: "Missing title or company" };
  }

  // Information-density check (per today's research: real jobs have
  // requirements; a near-empty scrape is either a scraping error or a
  // genuinely thin/scam listing) — only fires when BOTH signals are weak,
  // not either alone, since a short posting with a real salary figure is
  // still plausibly a real, just-terse listing.
  const descriptionLength = (job.description ?? "").trim().length;
  if (descriptionLength < 150 && !job.salary) {
    return { hide: true, reason: `Description too short (${descriptionLength} chars) with no salary listed` };
  }

  if (isStale(job.posted_at)) {
    return { hide: true, reason: `Posted more than ${MAX_POSTING_AGE_DAYS} days ago (${job.posted_at})` };
  }

  const companyLower = job.company.toLowerCase();
  if (STAFFING_AGENCY_NAMES.some((name) => companyLower.includes(name))) {
    return { hide: true, reason: `Listed under a staffing agency (${job.company}), not the hiring company directly` };
  }

  const haystack = `${job.title} ${job.description ?? ""}`;
  if (SPAM_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { hide: true, reason: "Matched a known spam/scam phrasing pattern" };
  }

  return { hide: false };
}
