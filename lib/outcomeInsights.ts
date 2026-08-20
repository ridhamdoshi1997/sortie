import type { RejectionReasonCategory } from "@/lib/rejectionIntelligence";

// §Q3 Application -> Outcome Loop (build-plan.md) — pure aggregation over a
// user's own already-stored history, zero AI, zero new external data. The
// whole point is turning data this app already collects (match scores,
// evaluation grades, rejection diagnoses, and now — thanks to §Q1 — real
// per-event application history) into honest, self-referential pattern
// signals, not a market benchmark or anyone else's data.

export type OutcomeJob = {
  id: string;
  match_score: number | null;
  overall_grade: "A" | "B" | "C" | "D" | "F" | null;
  application_status: "draft" | "applied" | "interviewing" | "offered" | "rejected";
  rejection_diagnosis: { possibleReasons: { category: RejectionReasonCategory; explanation: string }[] } | null;
};

export type ApplicationEventLite = { job_id: string; event_type: string };

export type MatchScoreBandStat = { band: string; applied: number; interviewed: number; rate: number };
export type GradeStat = { grade: string; applied: number; interviewed: number; rate: number };
export type RejectionCategoryStat = { category: RejectionReasonCategory; count: number };
export type SkipReasonStat = { reason: string; count: number };
export type DecisionLite = { decision: "applied" | "skipped"; skip_reason: string | null };

// A rate computed from 1-2 data points reads as a confident percentage but
// is really just noise — this app's own established convention (see
// lib/jobStatus.ts's STALE_AFTER_DAYS honesty-over-precision precedent)
// is to withhold a stat rather than show a misleadingly crisp number.
const MIN_SAMPLE_SIZE = 3;

const MATCH_SCORE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "80-100%", min: 80, max: 100 },
  { label: "60-79%", min: 60, max: 79 },
  { label: "Below 60%", min: 0, max: 59 },
];

function jobEverInterviewed(jobId: string, events: ApplicationEventLite[]): boolean {
  return events.some(
    (event) =>
      event.job_id === jobId && (event.event_type === "interview_scheduled" || event.event_type === "interview_completed"),
  );
}

export function computeInterviewRateByMatchBand(
  jobs: OutcomeJob[],
  events: ApplicationEventLite[],
): MatchScoreBandStat[] {
  const applied = jobs.filter((job) => job.application_status !== "draft" && typeof job.match_score === "number");

  return MATCH_SCORE_BANDS.map((band) => {
    const inBand = applied.filter((job) => (job.match_score as number) >= band.min && (job.match_score as number) <= band.max);
    const interviewed = inBand.filter((job) => jobEverInterviewed(job.id, events));
    return {
      band: band.label,
      applied: inBand.length,
      interviewed: interviewed.length,
      rate: inBand.length > 0 ? Math.round((interviewed.length / inBand.length) * 100) : 0,
    };
  }).filter((stat) => stat.applied >= MIN_SAMPLE_SIZE);
}

export function computeInterviewRateByGrade(jobs: OutcomeJob[], events: ApplicationEventLite[]): GradeStat[] {
  const grades: NonNullable<OutcomeJob["overall_grade"]>[] = ["A", "B", "C", "D", "F"];
  const applied = jobs.filter((job) => job.application_status !== "draft" && job.overall_grade);

  return grades
    .map((grade) => {
      const inGrade = applied.filter((job) => job.overall_grade === grade);
      const interviewed = inGrade.filter((job) => jobEverInterviewed(job.id, events));
      return {
        grade,
        applied: inGrade.length,
        interviewed: interviewed.length,
        rate: inGrade.length > 0 ? Math.round((interviewed.length / inGrade.length) * 100) : 0,
      };
    })
    .filter((stat) => stat.applied >= MIN_SAMPLE_SIZE);
}

export function computeRejectionReasonDistribution(jobs: OutcomeJob[]): RejectionCategoryStat[] {
  const counts = new Map<RejectionReasonCategory, number>();
  for (const job of jobs) {
    if (job.application_status !== "rejected" || !job.rejection_diagnosis) continue;
    for (const reason of job.rejection_diagnosis.possibleReasons) {
      counts.set(reason.category, (counts.get(reason.category) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

// Q3 fast-follow — top reasons behind real "skipped" decisions (see
// actions/jobs.ts's recordJobDecision). Unreasoned skips ("Skip without a
// reason") are deliberately excluded from this specific breakdown, not
// counted as their own bucket — they're real data (see applied-vs-skipped
// below) but "no reason given" isn't a pattern worth surfacing as one.
export function computeSkipReasons(decisions: DecisionLite[]): SkipReasonStat[] {
  const counts = new Map<string, number>();
  for (const d of decisions) {
    if (d.decision !== "skipped" || !d.skip_reason) continue;
    counts.set(d.skip_reason, (counts.get(d.skip_reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

export function computeAppliedVsSkipped(decisions: DecisionLite[]): { applied: number; skipped: number } {
  return {
    applied: decisions.filter((d) => d.decision === "applied").length,
    skipped: decisions.filter((d) => d.decision === "skipped").length,
  };
}

// Gates the whole insights section, not just one stat — a user with 1-2
// tracked applications gets an honest "not enough data yet" state instead
// of a section that's mostly empty bands.
export function hasEnoughDataForInsights(jobs: OutcomeJob[]): boolean {
  return jobs.filter((job) => job.application_status !== "draft").length >= MIN_SAMPLE_SIZE;
}
