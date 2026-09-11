import { CheckCircle2, AlertTriangle, HelpCircle, ExternalLink, Globe } from "lucide-react";

import type { LinkHealthBucket, SourceReport } from "@/lib/admin/linkHealth";

// Ordered worst-last so the healthy state reads first — same "lead with
// the real signal" framing the rest of the admin console uses. Every
// colour comes from a semantic token (ui-tokens.md), never a raw hex or
// Tailwind palette class.
const BUCKETS: {
  key: LinkHealthBucket;
  label: string;
  hint: string;
  tone: "good" | "ok" | "warn" | "bad";
  icon: typeof CheckCircle2;
}[] = [
  {
    key: "direct",
    label: "Direct to employer",
    hint: "The company's own posting or ATS. Best case.",
    tone: "good",
    icon: CheckCircle2,
  },
  {
    key: "board",
    label: "Major job board",
    hint: "LinkedIn, Indeed and similar. Safe, but not the source.",
    tone: "ok",
    icon: Globe,
  },
  {
    key: "generic",
    label: "Generic company page",
    hint: "Right employer, wrong page — a careers landing page, not the job.",
    tone: "warn",
    icon: AlertTriangle,
  },
  {
    key: "mirror",
    label: "Low-quality mirror",
    hint: "Scraper/reposter sites. Often expired listings or signup walls.",
    tone: "bad",
    icon: AlertTriangle,
  },
  {
    key: "unknown",
    label: "Unverified",
    hint: "A site we can't confirm belongs to the employer.",
    tone: "warn",
    icon: HelpCircle,
  },
];

const TONE_CLASS: Record<"good" | "ok" | "warn" | "bad", string> = {
  good: "text-success",
  ok: "text-info",
  warn: "text-warning",
  bad: "text-error",
};

const BAR_CLASS: Record<"good" | "ok" | "warn" | "bad", string> = {
  good: "bg-success",
  ok: "bg-info",
  warn: "bg-warning",
  bad: "bg-error",
};

export function LinkHealthReport({ report }: { report: SourceReport }) {
  const { total, counts, worst, sampleSize, sampled, label, note } = report;

  if (sampleSize === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-text-secondary">
          No rows with apply links in {label}. {note}
        </p>
      </div>
    );
  }

  // Denominator is sampleSize, NOT total. For the crawl cache those differ by
  // two orders of magnitude (a ~5,000-row sample of ~810,000 postings), and
  // dividing by total would render every bucket as 0% and read as "no
  // problems" — the most dangerous possible wrong answer on this page.
  const pct = (n: number) => Math.round((n / sampleSize) * 100);
  const healthy = counts.direct + counts.board;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
            Trustworthy destinations
          </p>
          <p className="text-2xl font-bold text-text-primary">{pct(healthy)}%</p>
        </div>
        {/* One stacked bar, not five separate meters — the reader's real
            question is "what's the mix", which a single 100%-wide bar
            answers at a glance. */}
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-secondary">
          {BUCKETS.map(({ key, tone }) =>
            counts[key] > 0 ? (
              <div key={key} className={BAR_CLASS[tone]} style={{ width: `${(counts[key] / total) * 100}%` }} />
            ) : null,
          )}
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {sampled
            ? `${sampleSize.toLocaleString()} classified of ${total.toLocaleString()} with an apply link`
            : `${total.toLocaleString()} rows with an apply link`}
        </p>
        <p className="mt-1 text-xs text-text-muted">{note}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BUCKETS.map(({ key, label, hint, tone, icon: Icon }) => (
          <div key={key} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 shrink-0 ${TONE_CLASS[tone]}`} />
              <p className="text-sm font-semibold text-text-primary">{label}</p>
            </div>
            <p className="mt-2 text-2xl font-bold text-text-primary">
              {counts[key].toLocaleString()}
              <span className="ml-1.5 text-sm font-medium text-text-secondary">{pct(counts[key])}%</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">{hint}</p>
          </div>
        ))}
      </div>

      {worst.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <p className="text-sm font-semibold text-text-primary">Needs attention</p>
            <p className="text-xs text-text-muted">
              Up to 50 shown. These are retried automatically every hour — a link that stays here has no better
              destination available yet.
            </p>
          </div>
          <div className="divide-y divide-border">
            {worst.map((job) => (
              <div key={job.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {job.company ?? "Unknown company"}
                    <span className="ml-2 font-normal text-text-secondary">{job.title}</span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-text-muted">{job.url}</p>
                </div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 shrink-0 text-text-muted transition-colors hover:text-text-primary"
                  aria-label="Open this apply link in a new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
