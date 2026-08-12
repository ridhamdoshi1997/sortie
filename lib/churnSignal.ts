// Reappearing Requisition Signal — the honestly-buildable version of a
// "churn seat" tracker. Real turnover data (department-level exodus,
// role-vacancy history) has no free, legal source — confirmed via research
// before building this (SEC filings only cover named executives, Glassdoor/
// Indeed scraping violates ToS, WARN Act only covers mass layoffs). The one
// legitimate signal: whether the same role at the same company keeps
// reappearing as a distinct new listing across this user's own accumulated
// search history over time. Uses zero new data — everything here is
// computed from jobs this app has already scraped and stored.

export type ReappearanceSignal = {
  level: "likely";
  label: string;
} | null;

const MIN_OCCURRENCES = 3;
const MIN_SPAN_DAYS = 30;

function fingerprint(company: string | null, title: string | null): string {
  return `${(company ?? "").trim().toLowerCase()}|${(title ?? "").trim().toLowerCase()}`;
}

type FingerprintStat = { count: number; spanDays: number };

// Compute once per page load over a user's full job history, then look up
// per-job — recomputing this per-card would be O(n^2) over the same list.
export function computeReappearanceCounts(
  jobs: { company: string | null; title: string | null; found_at: string }[],
): Map<string, FingerprintStat> {
  const groups = new Map<string, number[]>();

  for (const job of jobs) {
    if (!job.title || !job.company) continue;
    const fp = fingerprint(job.company, job.title);
    const dates = groups.get(fp) ?? [];
    dates.push(new Date(job.found_at).getTime());
    groups.set(fp, dates);
  }

  const stats = new Map<string, FingerprintStat>();
  for (const [fp, timestamps] of groups) {
    const sorted = [...timestamps].sort((a, b) => a - b);
    const spanDays = sorted.length > 1 ? Math.round((sorted[sorted.length - 1] - sorted[0]) / 86_400_000) : 0;
    stats.set(fp, { count: sorted.length, spanDays });
  }

  return stats;
}

export function getReappearanceSignal(
  job: { company: string | null; title: string | null },
  counts: Map<string, FingerprintStat>,
): ReappearanceSignal {
  if (!job.title || !job.company) return null;
  const stat = counts.get(fingerprint(job.company, job.title));
  if (!stat || stat.count < MIN_OCCURRENCES || stat.spanDays < MIN_SPAN_DAYS) return null;

  const weeks = Math.max(1, Math.round(stat.spanDays / 7));
  return {
    level: "likely",
    label: `Reappeared in ${stat.count} of your searches over ${weeks} week${weeks === 1 ? "" : "s"}`,
  };
}
