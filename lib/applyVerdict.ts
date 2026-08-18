import { getListingSignal } from "@/lib/jobStatus";
import type { Job } from "@/types";

export type ApplyVerdictTier = "apply" | "consider" | "long-shot" | "skip" | "unscored";

export type ApplyVerdict = {
  tier: ApplyVerdictTier;
  label: string;
  reason: string;
};

type VerdictInput = Pick<
  Job,
  | "overall_grade"
  | "recommendation_score"
  | "evaluation"
  | "title_scope_mismatch"
  | "marked_unavailable_at"
  | "dropped_from_search_at"
  | "found_at"
>;

const GRADE_TIER: Record<string, ApplyVerdictTier> = {
  A: "apply",
  B: "apply",
  C: "consider",
  D: "long-shot",
  F: "skip",
};

const TIER_LABEL: Record<ApplyVerdictTier, string> = {
  apply: "Apply",
  consider: "Consider",
  "long-shot": "Long shot",
  skip: "Skip",
  unscored: "Not yet scored",
};

// One notch worse than the grade-derived tier, used when the listing
// "likely" dropped from a repeat search — not confirmed unavailable (that's
// its own hard "skip" below), just a real reason to trust the grade less.
const DOWNGRADE: Record<ApplyVerdictTier, ApplyVerdictTier> = {
  apply: "consider",
  consider: "long-shot",
  "long-shot": "skip",
  skip: "skip",
  unscored: "unscored",
};

function gradeReason(grade: string, score: number | null): string {
  const scorePart = score != null ? ` (${score.toFixed(1)}/5 recommendation)` : "";
  switch (grade) {
    case "A":
      return `Excellent overall fit${scorePart}.`;
    case "B":
      return `Good overall fit${scorePart}.`;
    case "C":
      return `A fair, middling fit${scorePart} — worth a look if the role interests you.`;
    case "D":
      return `A weak fit${scorePart} — real gaps against your profile.`;
    case "F":
      return `A poor fit${scorePart}.`;
    default:
      return "";
  }
}

// Deterministic, zero AI cost — synthesizes signals ALREADY computed
// elsewhere (the 10-dimension evaluation's overall grade, the
// listing-staleness heuristic in lib/jobStatus.ts, the title/scope mismatch
// flag) into one decisive top-of-page answer, instead of leaving the user
// to mentally combine a grade + a score + scattered warning callouts
// themselves. build-plan.md's "Should I apply? quick verdict" (Tier 2).
export function computeApplyVerdict(job: VerdictInput): ApplyVerdict {
  const listingSignal = getListingSignal(job);
  if (listingSignal?.level === "confirmed") {
    return { tier: "skip", label: TIER_LABEL.skip, reason: "Marked no longer available." };
  }

  if (job.overall_grade == null) {
    return { tier: "unscored", label: TIER_LABEL.unscored, reason: "Still being evaluated — check back shortly." };
  }

  const legitimacyDim = (job.evaluation ?? []).find((d) => d.dimension === "Legitimacy");
  if (legitimacyDim && (legitimacyDim.grade === "D" || legitimacyDim.grade === "F")) {
    return { tier: "skip", label: TIER_LABEL.skip, reason: "Graded poorly on legitimacy signals — possible ghost listing." };
  }

  if (job.title_scope_mismatch?.flagged) {
    return { tier: "long-shot", label: TIER_LABEL["long-shot"], reason: job.title_scope_mismatch.note };
  }

  const baseTier = GRADE_TIER[job.overall_grade] ?? "consider";

  if (listingSignal?.level === "likely") {
    const tier = DOWNGRADE[baseTier];
    return {
      tier,
      label: TIER_LABEL[tier],
      reason: `Graded ${job.overall_grade}, but this listing didn't reappear in your last search — it may no longer be open.`,
    };
  }

  return { tier: baseTier, label: TIER_LABEL[baseTier], reason: gradeReason(job.overall_grade, job.recommendation_score) };
}
